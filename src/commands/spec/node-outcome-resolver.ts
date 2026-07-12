import { currentStalenessInputs, discoverTestFiles } from "@/commands/test";
import type { GitDependencies } from "@/lib/git/root";
import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  type NodeOutcomeResolver,
  type NodeStatusEvidenceOutcome,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { compareAsciiStrings } from "@/lib/state-store";
import type { TestingRegistry } from "@/test/registry";
import {
  extractStalenessInputs,
  isStalenessMatch,
  readTestingRuns,
  selectLatestTerminalTestRunForNode,
  type StalenessInputs,
  type TestRunnerOutcome,
  type TestRunStateFileSystem,
  type TestTerminalRun,
} from "@/test/run-state";

const PATH_SEPARATOR = "/";
const SUCCESS_EXIT_CODE = 0;

/** Dependencies the production resolver composes over the testing domain. */
export interface NodeOutcomeResolverDependencies {
  readonly productDir: string;
  readonly registry: TestingRegistry;
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

type CurrentStalenessInputsFor = (coveredPaths: readonly string[]) => Promise<StalenessInputs>;

/**
 * Builds the node-outcome resolver `spx spec status --update` injects into the
 * node-status orchestration: for a node it reports the outcomes the testing domain's
 * recorded evidence resolves, and runs nothing. A reference the recorded evidence
 * does not resolve — because the latest covering run is stale, or because no run
 * covers the node — is left unresolved, and the orchestration carries that
 * reference's committed outcome forward. Composed at the command layer over the
 * testing domain so the pure node-status library and the testing library stay
 * independent. The discovered test files and recorded runs are read once and
 * memoized across nodes, so resolving N nodes performs one tree walk and one
 * run-file read rather than N of each.
 */
export function createNodeOutcomeResolver(deps: NodeOutcomeResolverDependencies): NodeOutcomeResolver {
  let evidence: Promise<ResolverEvidence> | undefined;
  const currentInputsByCoveredPaths = new Map<string, Promise<StalenessInputs>>();
  const sharedEvidence = (): Promise<ResolverEvidence> => (evidence ??= loadResolverEvidence(deps));
  const currentInputsFor: CurrentStalenessInputsFor = (coveredPaths) => {
    const cacheKey = coveredPathCollectionKey(coveredPaths);
    const cached = currentInputsByCoveredPaths.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const current = currentStalenessInputs(deps.productDir, coveredPaths, deps);
    currentInputsByCoveredPaths.set(cacheKey, current);
    return current;
  };

  return async (
    nodeId: string,
    evidencePaths: readonly string[],
  ): Promise<Readonly<Record<string, NodeStatusEvidenceOutcome>>> => {
    const { discoveredTestPaths, terminalRuns } = await sharedEvidence();
    const nodePath = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${PATH_SEPARATOR}${nodeId}`;
    const nodeTestPaths = filterNodeTestPaths(discoveredTestPaths, nodePath, evidencePaths);
    return await recordedOutcome(discoveredTestPaths, terminalRuns, nodeTestPaths, currentInputsFor);
  };
}

function coveredPathCollectionKey(coveredPaths: readonly string[]): string {
  return JSON.stringify([...coveredPaths].sort(compareAsciiStrings));
}

// Reads the discovered test files and recorded terminal runs once for the whole
// --update pass. A failed run-state read yields no terminal runs, so every node
// reads as unresolved and keeps its committed outcome.
async function loadResolverEvidence(deps: NodeOutcomeResolverDependencies): Promise<ResolverEvidence> {
  const discoveredTestPaths = await discoverTestFiles(deps.productDir);
  const runs = await readTestingRuns(deps.productDir, deps);
  return { discoveredTestPaths, terminalRuns: runs.ok ? runs.value.terminalRuns : [] };
}

// A node's test paths are the discovered test files under its subtree — the same
// set a run records against, so coverage-gated evidence selection and the recording
// run agree on path identity.
function filterNodeTestPaths(
  discoveredTestPaths: readonly string[],
  nodePath: string,
  evidencePaths: readonly string[],
): readonly string[] {
  const prefix = `${nodePath}${PATH_SEPARATOR}`;
  const discovered = new Set(discoveredTestPaths.filter((path) => path.startsWith(prefix)));
  return evidencePaths.filter((path) => discovered.has(path));
}

// Folds the node's outcomes from the latest covering run when that run is fresh —
// every staleness digest matches the node's current inputs by the same recipe the
// run recorded with — whatever verdict the run reached: a fresh failing run folds as
// failed. Stale or absent evidence resolves nothing, so each reference keeps the
// outcome already committed for it.
async function recordedOutcome(
  discoveredTestPaths: readonly string[],
  terminalRuns: readonly TestTerminalRun[],
  nodeTestPaths: readonly string[],
  currentInputsFor: CurrentStalenessInputsFor,
): Promise<Readonly<Record<string, NodeStatusEvidenceOutcome>>> {
  const latest = selectLatestTerminalTestRunForNode(terminalRuns, nodeTestPaths);
  if (latest === undefined) {
    return {};
  }
  // Compare freshness over the run's own covered paths — the set its recorded
  // digests were derived from — so a covering run reads as fresh when its executed
  // files are unchanged. Comparing over only the node's paths would judge a fresh
  // full-product run stale for any node smaller than the whole product.
  const runCoveredPaths = latest.state.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
  // A covered test file deleted or renamed since the run leaves the recorded
  // evidence unable to resolve the node; the committed outcome stands rather than a
  // read of a path that no longer exists.
  const presentTestPaths = new Set(discoveredTestPaths);
  if (!runCoveredPaths.every((path) => presentTestPaths.has(path))) {
    return {};
  }
  const current = await currentInputsFor(runCoveredPaths);
  if (!isStalenessMatch(extractStalenessInputs(latest.state), current)) {
    return {};
  }
  return outcomesForPaths(latest.state.runnerOutcomes, nodeTestPaths);
}

function outcomesForPaths(
  outcomes: readonly TestRunnerOutcome[],
  nodeTestPaths: readonly string[],
): Readonly<Record<string, NodeStatusEvidenceOutcome>> {
  return Object.fromEntries(
    nodeTestPaths.map((path) => [path, outcomeForPath(outcomes, path)]),
  );
}

function outcomeForPath(
  outcomes: readonly TestRunnerOutcome[],
  path: string,
): NodeStatusEvidenceOutcome {
  const covering = outcomes.filter((outcome) => outcome.testPaths.includes(path));
  if (covering.length === 0) return NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN;
  if (covering.every((outcome) => outcome.exitCode === SUCCESS_EXIT_CODE)) {
    return NODE_STATUS_EVIDENCE_OUTCOME.PASSED;
  }
  return NODE_STATUS_EVIDENCE_OUTCOME.FAILED;
}
