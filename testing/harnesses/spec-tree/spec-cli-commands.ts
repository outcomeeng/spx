import { existsSync } from "node:fs";
import { join } from "node:path";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import { OUTPUT_FORMAT, statusCommand } from "@/commands/spec/status";
import { runTestsCommand } from "@/commands/test";
import type { GitDependencies } from "@/lib/git/root";
import {
  classifyNodeStatus,
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  hasNodeStatusVerificationReferences,
  NODE_STATUS_CLAIM_SHAPE,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeAttributedResultResolver,
  type NodeOutcomeResolver,
  type NodeReadPathResolver,
  type NodeStatusClaim,
  type NodeStatusClaimDifference,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
  readNodeStatus,
  serializeNodeStatus,
  serializeNodeStatusClaim,
} from "@/lib/node-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import type { TerminalText } from "@/lib/terminal-text/terminal-text";
import { testingRegistry } from "@/test/registry";
import {
  defaultTestRunStateFileSystem,
  TEST_PATH_VERDICT,
  type TestPathVerdictValue,
  type TestRunStateFileSystem,
} from "@/test/run-state";
import { createClaimedTestStatus } from "@testing/generators/node-status/node-status";
import { evidenceFileNameFor, evidenceSubject } from "@testing/generators/spec-tree/evidence-file-name";
import {
  type RepresentativeSpecTreeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import type { PinnedNodeRepository } from "@testing/harnesses/node-status/node-status";
import type { CurrentSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { SIMULATED_EXIT_CODE, SIMULATED_REPORT } from "@testing/harnesses/testing/simulated-report";
import {
  createRecordingCommandRunner,
  VITEST_FIXTURE,
  type VitestFixture,
  writeVitestFixture,
} from "@testing/harnesses/testing/typescript-runner";

/** The tree-relative directory of a fixture node at the top of the tree, in the grammar the source owns. */
export function fixtureNodePath(node: RepresentativeSpecTreeFixture["root"]): string {
  return specTreeFixtureNodeDirectoryName(KIND_REGISTRY, node);
}

/** Makes `productDir` a git repository whose index tracks `paths`, without committing them. */
export async function trackPathsInGit(productDir: string, paths: readonly string[]): Promise<void> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
  if (paths.length > 0) await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, ...paths]);
}

/** Makes `productDir` a git repository with one commit holding `paths`, under the test committer identity. */
export async function commitPathsInGit(productDir: string, paths: readonly string[], message: string): Promise<void> {
  await trackPathsInGit(productDir, paths);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, message]);
}

/** The production resolver over recorded testing evidence, as the `--update` descriptor composes it. */
export function recordedEvidenceResolverFor(productDir: string): NodeOutcomeResolver {
  return createNodeOutcomeResolver({ productDir, registry: testingRegistry });
}

/**
 * A controlled resolver under the combinatorial-cost exception: it reports
 * every evidence path at `outcome`, so a case exercises status writing and
 * rollup apart from the production resolver's recorded-evidence logic.
 */
export function uniformOutcomeResolverFor(outcome: NodeStatusEvidenceOutcome): () => NodeOutcomeResolver {
  return () => (_nodeId, evidencePaths) =>
    Promise.resolve(Object.fromEntries(evidencePaths.map((path) => [path, outcome])));
}

/**
 * A recording test-run-state filesystem under the observability exception: it
 * reads through the real filesystem and counts each read of a watched path, so
 * the test decides how often staleness inputs were computed.
 */
export function createReadCountingTestRunStateFileSystem(watched: ReadonlySet<string>): {
  readonly fs: TestRunStateFileSystem;
  readonly readCount: (path: string) => number;
} {
  const counts = new Map<string, number>();
  return {
    fs: {
      ...defaultTestRunStateFileSystem,
      readFile: async (path, encoding) => {
        if (watched.has(path)) counts.set(path, (counts.get(path) ?? 0) + 1);
        return defaultTestRunStateFileSystem.readFile(path, encoding);
      },
    },
    readCount: (path) => counts.get(path) ?? 0,
  };
}

/**
 * Replaces an evidence file's bytes with the committed passing Vitest suite, so
 * any run recorded against its earlier content is stale.
 */
export async function changeNodeEvidenceContent(env: CurrentSpecTreeEnv, evidenceFile: string): Promise<void> {
  await writeVitestFixture(env.productDir, evidenceFile, VITEST_FIXTURE.PASSING);
}

/** A TypeScript spec-tree evidence path (`<slug>.<mode>.<level>.test.ts`) under `nodePath`'s tests directory. */
export function nodeEvidencePath(nodePath: string, evidenceIndex = 0): string {
  const [mode] = SPEC_TREE_EVIDENCE_FILE.MODES;
  const [level] = SPEC_TREE_EVIDENCE_FILE.LEVELS;
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug(), evidenceIndex);
  const filename = evidenceFileNameFor(
    [evidenceSubject(slug), mode, level],
    SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT,
  );
  return [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodePath, SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME, filename].join(
    SPEC_TREE_GRAMMAR.PATH_SEPARATOR,
  );
}

/**
 * Writes an empty TypeScript evidence file under the node, so the node reaches
 * the test-outcome stage and the TypeScript runner dispatches it; returns its
 * product-relative path.
 */
export async function addNodeTestFile(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  evidenceIndex = 0,
): Promise<string> {
  const evidenceFile = nodeEvidencePath(nodePath, evidenceIndex);
  await writeTestFileFixture(env.productDir, evidenceFile);
  return evidenceFile;
}

/** Writes a real Vitest evidence file of the given fixture shape under the node; returns its product-relative path. */
export async function addNodeVitestFixture(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  fixture: VitestFixture,
  evidenceIndex = 0,
): Promise<string> {
  const evidenceFile = nodeEvidencePath(nodePath, evidenceIndex);
  await writeVitestFixture(env.productDir, evidenceFile, fixture);
  return evidenceFile;
}

/** The product-relative path of a node's committed status claim. */
export function nodeStatusPath(nodePath: string): string {
  return [SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodePath, NODE_STATUS_FILENAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}

/** Writes a committed status claim recording one passing test reference at `evidencePath`. */
export async function writePassingStatusClaim(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  evidencePath: string,
): Promise<void> {
  await env.writeRaw(
    nodeStatusPath(nodePath),
    serializeNodeStatus(createNodeStatusFile({
      [NODE_STATUS_VERIFICATION_MECHANISM.TEST]: createNodeStatusMechanismRecord({
        [evidencePath]: NODE_STATUS_EVIDENCE_OUTCOME.PASSED,
      }),
    })),
  );
}

/** The node's recorded status claim, or `undefined` when no claim was written. */
export async function readRecordedStatusFile(
  env: CurrentSpecTreeEnv,
  nodePath: string,
): Promise<NodeStatusFile | undefined> {
  const statusPath = nodeStatusPath(nodePath);
  if (!existsSync(join(env.productDir, statusPath))) return undefined;
  return JSON.parse(await env.readFile(statusPath)) as NodeStatusFile;
}

/** The lifecycle state the node's recorded claim classifies to, or `undefined` when no claim was written. */
export async function readRecordedStatusState(env: CurrentSpecTreeEnv, nodePath: string): Promise<string | undefined> {
  const status = await readRecordedStatusFile(env, nodePath);
  if (status === undefined) return undefined;
  return classifyNodeStatus({
    hasVerificationReferences: hasNodeStatusVerificationReferences(status.verification),
    isExcluded: false,
    verification: status.verification,
  });
}

/** One git invocation the recording git root double received. */
export interface RecordedGitCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
}

/**
 * A recording git-root collaborator under the interaction-protocol exception:
 * it answers every invocation with `productDir` as the worktree root and
 * records the command, arguments, and working directory it received, so the
 * test decides whether the root resolution asked git the right question.
 */
export function createRecordingGitRoot(productDir: string): {
  readonly dependencies: GitDependencies;
  readonly calls: () => readonly RecordedGitCall[];
} {
  const calls: RecordedGitCall[] = [];
  return {
    dependencies: {
      execa: async (command, args, options) => {
        calls.push({ command, args: [...args], cwd: options?.cwd?.toString() });
        return { exitCode: 0, stderr: "", stdout: productDir };
      },
    },
    calls: () => calls,
  };
}

type RecordingRunnerDeps = ReturnType<NonNullable<Parameters<typeof runTestsCommand>[1]["runnerDepsFor"]>>;

/** Records one full testing run of `productDir` through the injected `runner`, as the `--update` path reads it back. */
export async function recordTestingRun(productDir: string, runner: RecordingRunnerDeps): Promise<void> {
  await runTestsCommand({ productDir, passing: false }, { registry: testingRegistry, runnerDepsFor: () => runner });
}

/**
 * Records one testing run whose report gives `testFile` the `verdict`, as the
 * `--update` path reads it back; a `not-run` verdict leaves the file out of the
 * report, so the run covers it without an outcome.
 */
export async function recordTestingRunReporting(
  productDir: string,
  testFile: string,
  verdict: TestPathVerdictValue,
): Promise<void> {
  const reported = verdict === TEST_PATH_VERDICT.NOT_RUN ? [] : [[testFile, verdict] as const];
  await recordTestingRun(
    productDir,
    createRecordingCommandRunner({
      present: true,
      exitCode: SIMULATED_EXIT_CODE.SUCCESS,
      report: SIMULATED_REPORT.LISTED_FILES,
      reportedStatuses: new Map(reported),
    }),
  );
}

/** A result as the `spx spec status --json` document carries it; every field is read as the document spells it. */
export interface ReportedStatusResult {
  readonly section: string;
  readonly key: string;
  readonly verdict: string;
  readonly commit?: string;
  readonly read?: readonly string[];
  readonly actor?: { readonly kind: string; readonly id: string };
  readonly run?: string;
  readonly currency: string;
}

/** A node as the `spx spec status --json` document carries it, with the claim it reports when it has one. */
export interface ReportedStatusNode {
  readonly id: string;
  readonly state: string;
  readonly children: readonly ReportedStatusNode[];
  readonly claim?: {
    readonly shape: string;
    readonly state: string;
    readonly results: readonly ReportedStatusResult[];
  };
}

/**
 * Runs `spx spec status --json` through the production status command against `productDir` and returns the
 * document's entry for `nodeId`, or `undefined` when the document holds none.
 */
export async function readStatusJsonNode(
  productDir: string,
  nodeId: string,
  gitDependencies: GitDependencies,
): Promise<ReportedStatusNode | undefined> {
  const output = await statusCommand({ cwd: productDir, format: OUTPUT_FORMAT.JSON, gitDependencies });
  const document = JSON.parse(output) as { readonly nodes: readonly ReportedStatusNode[] };
  const search = (nodes: readonly ReportedStatusNode[]): ReportedStatusNode | undefined => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      const found = search(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return search(document.nodes);
}

/**
 * Writes a version-1 claim into the node directory `nodeDirectory` (product-relative), recording `evidencePath`
 * at `verdict`.
 */
export async function writeVersionOneClaim(
  env: Pick<CurrentSpecTreeEnv, "writeRaw">,
  nodeDirectory: string,
  evidencePath: string,
  verdict: NodeStatusEvidenceOutcome,
): Promise<void> {
  await env.writeRaw(
    [nodeDirectory, NODE_STATUS_FILENAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
    serializeNodeStatus(createClaimedTestStatus([evidencePath], verdict)),
  );
}

/** The resolvers `spx spec status --update` is injected with, each answering every consulted reference as passed. */
export interface StatusProjectionResolvers {
  readonly resolveOutcomeFor: (productDir: string) => NodeOutcomeResolver;
  readonly resolveReadPathsFor: (productDir: string) => NodeReadPathResolver;
  readonly resolveAttributedResultsFor: (productDir: string) => NodeAttributedResultResolver;
}

/** The projection a pinned node repository commits: the resolvers that produced it and the claim it wrote. */
export interface CommittedProjection {
  readonly resolvers: StatusProjectionResolvers;
  readonly claim: NodeStatusClaim;
}

/**
 * Commits the projection `spx spec status --update` writes for the repository's node under passing resolvers,
 * after a later commit so the projection pins a commit other than the repository's first.
 */
export async function commitRegeneratedProjection(repository: PinnedNodeRepository): Promise<CommittedProjection> {
  await repository.commitUnrelatedFile();
  const read = [repository.specPath, repository.testPaths[0] ?? "", repository.subjectPaths[0] ?? ""];
  const resolvers: StatusProjectionResolvers = {
    resolveOutcomeFor: () => repository.passingOutcomes,
    resolveReadPathsFor: () => () => Promise.resolve(read),
    resolveAttributedResultsFor: () => repository.passedAttributedResults(read),
  };
  await statusCommand({
    cwd: repository.env.productDir,
    gitDependencies: repository.git,
    update: true,
    ...resolvers,
  });
  await repository.commitAll();
  const written = readNodeStatus(join(repository.env.productDir, repository.nodePath));
  if (written?.shape !== NODE_STATUS_CLAIM_SHAPE.CURRENT) {
    throw new Error(`The update wrote no current claim for ${repository.nodeId}`);
  }
  return { resolvers, claim: written.claim };
}

/** Replaces the repository node's committed claim with `claim` in a new commit. */
export async function commitNodeClaim(repository: PinnedNodeRepository, claim: NodeStatusClaim): Promise<void> {
  await repository.env.writeRaw(
    [repository.nodePath, NODE_STATUS_FILENAME].join(SPEC_TREE_GRAMMAR.PATH_SEPARATOR),
    serializeNodeStatusClaim(claim),
  );
  await repository.commitAll();
}

/** A `--update --check` that found differences, as the handler rejects with them. */
export interface StatusCheckFailure {
  readonly differences: readonly NodeStatusClaimDifference[];
  readonly report: TerminalText;
}

/** What `spx spec status --update --check` returned: the failure it rejected with, or the report it resolved to. */
export type StatusCheckOutcome =
  | { readonly failure: StatusCheckFailure; readonly output?: never }
  | { readonly failure?: never; readonly output: TerminalText };

/** Runs the check form against the repository and returns how the handler ended; any other rejection propagates. */
export async function runStatusCheck(
  repository: PinnedNodeRepository,
  resolvers: StatusProjectionResolvers,
): Promise<StatusCheckOutcome> {
  try {
    const output = await statusCommand({
      cwd: repository.env.productDir,
      gitDependencies: repository.git,
      update: true,
      check: true,
      ...resolvers,
    });
    return { output };
  } catch (error) {
    if (error instanceof Error && "differences" in error && "report" in error) {
      return { failure: error as Error & StatusCheckFailure };
    }
    throw error;
  }
}
