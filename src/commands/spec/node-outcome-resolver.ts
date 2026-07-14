import { currentStalenessInputs, discoverTestFiles } from "@/commands/test";
import {
  NODE_STATUS_EVIDENCE_OUTCOME,
  type NodeOutcomeResolver,
  type NodeStatusEvidenceOutcome,
} from "@/lib/node-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
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
  readonly fs?: TestRunStateFileSystem;
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
 * node-status orchestration: for a node it reports the latest usable recorded
 * testing evidence. Fresh covered references take the recorded outcome, stale
 * covered references remain unresolved so node-status can retain the committed
 * outcome, and uncovered references report not-run. The resolver never executes
 * verification. Discovered test files and recorded runs are read once and
 * memoized across nodes.
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
    return recordedOutcomes(
      discoveredTestPaths,
      terminalRuns,
      evidencePaths,
      nodeTestPaths,
      currentInputsFor,
    );
  };
}

function coveredPathCollectionKey(coveredPaths: readonly string[]): string {
  return JSON.stringify([...coveredPaths].sort(compareAsciiStrings));
}

// Reads the discovered test files and recorded terminal runs once for the whole
// --update pass. A failed run-state read yields no terminal runs, so every
// reference reports not-run.
async function loadResolverEvidence(deps: NodeOutcomeResolverDependencies): Promise<ResolverEvidence> {
  const discoveredTestPaths = await discoverTestFiles(deps.productDir);
  const runs = await readTestingRuns(deps.productDir, deps);
  return { discoveredTestPaths, terminalRuns: runs.ok ? runs.value.terminalRuns : [] };
}

// A node's test paths are linked evidence files discovered under its subtree.
function filterNodeTestPaths(
  discoveredTestPaths: readonly string[],
  nodePath: string,
  evidencePaths: readonly string[],
): readonly string[] {
  const prefix = `${nodePath}${PATH_SEPARATOR}`;
  const discovered = new Set(discoveredTestPaths.filter((path) => path.startsWith(prefix)));
  return evidencePaths.filter((path) => discovered.has(path));
}

async function recordedOutcomes(
  discoveredTestPaths: readonly string[],
  terminalRuns: readonly TestTerminalRun[],
  evidencePaths: readonly string[],
  nodeTestPaths: readonly string[],
  currentInputsFor: CurrentStalenessInputsFor,
): Promise<Readonly<Record<string, NodeStatusEvidenceOutcome>>> {
  const resolved: Record<string, NodeStatusEvidenceOutcome> = Object.fromEntries(
    evidencePaths.map((path) => [path, NODE_STATUS_EVIDENCE_OUTCOME.NOT_RUN]),
  );
  const presentTestPaths = new Set(discoveredTestPaths);
  for (const path of nodeTestPaths) {
    const latest = selectLatestTerminalTestRunForNode(terminalRuns, [path]);
    if (latest === undefined) continue;

    // Freshness is evaluated over the run's own covered set because its digests
    // were recorded for that set. A deleted covered path makes the run stale.
    const runCoveredPaths = latest.state.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
    if (!runCoveredPaths.every((coveredPath) => presentTestPaths.has(coveredPath))) {
      delete resolved[path];
      continue;
    }
    const current = await currentInputsFor(runCoveredPaths);
    if (!isStalenessMatch(extractStalenessInputs(latest.state), current)) {
      delete resolved[path];
      continue;
    }
    resolved[path] = outcomeForPath(latest.state.runnerOutcomes, path);
  }
  return resolved;
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
