import { currentStalenessInputs, discoverTestFiles, runNodeCommand } from "@/commands/testing";
import type { GitDependencies } from "@/git/root";
import type { NodeOutcomeResolver } from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import type { TestingLanguageDescriptor, TestRunnerDependencies } from "@/testing/languages/types";
import type { TestingRegistry } from "@/testing/registry";
import {
  extractStalenessInputs,
  isStalenessMatch,
  readTestingRuns,
  selectLatestTerminalTestRunForNode,
  TEST_RUN_STATE_STATUS,
  type TestRunStateFileSystem,
  type TestTerminalRun,
} from "@/testing/run-state";

const PATH_SEPARATOR = "/";

/** Dependencies the production resolver composes over the testing domain. */
export interface NodeOutcomeResolverDependencies {
  readonly productDir: string;
  readonly registry: TestingRegistry;
  readonly runnerDepsFor: (language: TestingLanguageDescriptor) => TestRunnerDependencies;
  readonly git?: GitDependencies;
  readonly fs?: TestRunStateFileSystem;
  readonly now?: () => Date;
}

// The product-wide inputs the per-node freshness check reads, gathered once per
// resolver rather than per node: the discovered test files and the recorded
// terminal runs.
interface ResolverEvidence {
  readonly discoveredTestPaths: readonly string[];
  readonly terminalRuns: readonly TestTerminalRun[];
}

/**
 * Builds the node-outcome resolver `spx spec status --update` injects into the
 * node-status orchestration: for a node it reports the latest usable recorded
 * testing evidence (fresh and passed) and runs the testing domain's registry-based
 * per-node run only when that evidence is stale, failing, or absent. Composed at
 * the command layer over the testing domain so the pure node-status library and
 * the testing library stay independent. The discovered test files and recorded
 * runs are read once and memoized across nodes, so resolving N nodes performs one
 * tree walk and one run-directory read rather than N of each.
 */
export function createNodeOutcomeResolver(deps: NodeOutcomeResolverDependencies): NodeOutcomeResolver {
  let evidence: Promise<ResolverEvidence> | undefined;
  const sharedEvidence = (): Promise<ResolverEvidence> => (evidence ??= loadResolverEvidence(deps.productDir));

  return async (nodeId: string): Promise<boolean> => {
    const { discoveredTestPaths, terminalRuns } = await sharedEvidence();
    const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodeId}`;
    const nodeTestPaths = filterNodeTestPaths(discoveredTestPaths, nodePath);
    const usable = await usableRecordedOutcome(deps, terminalRuns, nodeTestPaths);
    if (usable !== undefined) {
      return usable;
    }
    const { recorded } = await runNodeCommand({ productDir: deps.productDir, nodePath }, deps);
    return recorded.status === TEST_RUN_STATE_STATUS.PASSED;
  };
}

// Reads the discovered test files and recorded terminal runs once for the whole
// --update pass. A failed run-state read yields no terminal runs, so every node
// reads as absent and re-runs — the conservative-correct fallback.
async function loadResolverEvidence(productDir: string): Promise<ResolverEvidence> {
  const discoveredTestPaths = await discoverTestFiles(productDir);
  const runs = await readTestingRuns(productDir);
  return { discoveredTestPaths, terminalRuns: runs.ok ? runs.value.terminalRuns : [] };
}

// A node's test paths are the discovered test files under its subtree — the same
// set the per-node run records against, so coverage-gated evidence selection and
// the per-node run agree on path identity.
function filterNodeTestPaths(discoveredTestPaths: readonly string[], nodePath: string): readonly string[] {
  const prefix = `${nodePath}${PATH_SEPARATOR}`;
  return discoveredTestPaths.filter((path) => path.startsWith(prefix));
}

// Resolves a recorded outcome (true) only when the latest covering run is fresh —
// every staleness digest matches the node's current inputs by the same recipe the
// run recorded with — and passed. Returns undefined for stale, failing, or absent
// evidence, signalling that a fresh per-node run is required.
async function usableRecordedOutcome(
  deps: NodeOutcomeResolverDependencies,
  terminalRuns: readonly TestTerminalRun[],
  nodeTestPaths: readonly string[],
): Promise<boolean | undefined> {
  const latest = selectLatestTerminalTestRunForNode(terminalRuns, nodeTestPaths);
  if (latest === undefined) {
    return undefined;
  }
  const current = await currentStalenessInputs(deps.productDir, nodeTestPaths, deps);
  const fresh = isStalenessMatch(extractStalenessInputs(latest.state), current);
  return fresh && latest.state.status === TEST_RUN_STATE_STATUS.PASSED ? true : undefined;
}
