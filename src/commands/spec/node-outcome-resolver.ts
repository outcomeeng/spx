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

/**
 * Builds the node-outcome resolver `spx spec status --update` injects into the
 * node-status orchestration: for a node it reports the latest usable recorded
 * testing evidence (fresh and passed) and runs the testing domain's registry-based
 * per-node run only when that evidence is stale, failing, or absent. Composed at
 * the command layer over the testing domain so the pure node-status library and
 * the testing library stay independent.
 */
export function createNodeOutcomeResolver(deps: NodeOutcomeResolverDependencies): NodeOutcomeResolver {
  return async (nodeId: string): Promise<boolean> => {
    const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodeId}`;
    const nodeTestPaths = await nodeTestFilePaths(deps.productDir, nodePath);
    const usable = await usableRecordedOutcome(deps, nodeTestPaths);
    if (usable !== undefined) {
      return usable;
    }
    const { recorded } = await runNodeCommand({ productDir: deps.productDir, nodePath }, deps);
    return recorded.status === TEST_RUN_STATE_STATUS.PASSED;
  };
}

// A node's test paths are the discovered test files under its subtree — the same
// set the per-node run records against, so coverage-gated evidence selection and
// the per-node run agree on path identity.
async function nodeTestFilePaths(productDir: string, nodePath: string): Promise<readonly string[]> {
  const discovered = await discoverTestFiles(productDir);
  const prefix = `${nodePath}${PATH_SEPARATOR}`;
  return discovered.filter((path) => path.startsWith(prefix));
}

// Resolves a recorded outcome (true) only when the latest covering run is fresh —
// every staleness digest matches the node's current inputs by the same recipe the
// run recorded with — and passed. Returns undefined for stale, failing, or absent
// evidence, signalling that a fresh per-node run is required.
async function usableRecordedOutcome(
  deps: NodeOutcomeResolverDependencies,
  nodeTestPaths: readonly string[],
): Promise<boolean | undefined> {
  const runs = await readTestingRuns(deps.productDir);
  if (!runs.ok) {
    return undefined;
  }
  const latest = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
  if (latest === undefined) {
    return undefined;
  }
  const current = await currentStalenessInputs(deps.productDir, nodeTestPaths, deps);
  const fresh = isStalenessMatch(extractStalenessInputs(latest.state), current);
  return fresh && latest.state.status === TEST_RUN_STATE_STATUS.PASSED ? true : undefined;
}
