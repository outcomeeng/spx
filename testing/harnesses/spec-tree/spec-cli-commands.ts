import { existsSync } from "node:fs";
import { join } from "node:path";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import type { GitDependencies } from "@/lib/git/root";
import {
  classifyNodeStatus,
  createNodeStatusFile,
  createNodeStatusMechanismRecord,
  hasNodeStatusVerificationReferences,
  NODE_STATUS_EVIDENCE_OUTCOME,
  NODE_STATUS_FILENAME,
  NODE_STATUS_VERIFICATION_MECHANISM,
  type NodeOutcomeResolver,
  type NodeStatusEvidenceOutcome,
  type NodeStatusFile,
  serializeNodeStatus,
} from "@/lib/node-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import { defaultTestRunStateFileSystem, type TestRunStateFileSystem } from "@/test/run-state";
import {
  type RepresentativeSpecTreeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import type { CurrentSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { VITEST_FIXTURE, type VitestFixture, writeVitestFixture } from "@testing/harnesses/testing/typescript-runner";

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
export function nodeEvidencePath(nodePath: string): string {
  const [mode] = SPEC_TREE_EVIDENCE_FILE.MODES;
  const [level] = SPEC_TREE_EVIDENCE_FILE.LEVELS;
  const slug = sampleSpecTreeTestValue(SPEC_TREE_TEST_GENERATOR.sourceSlug());
  const filename = [slug, mode, level, ...SPEC_TREE_EVIDENCE_FILE.TAILS.TYPESCRIPT].join(
    SPEC_TREE_EVIDENCE_FILE.SEGMENT_SEPARATOR,
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
export async function addNodeTestFile(env: CurrentSpecTreeEnv, nodePath: string): Promise<string> {
  const evidenceFile = nodeEvidencePath(nodePath);
  await writeTestFileFixture(env.productDir, evidenceFile);
  return evidenceFile;
}

/** Writes a real Vitest evidence file of the given fixture shape under the node; returns its product-relative path. */
export async function addNodeVitestFixture(
  env: CurrentSpecTreeEnv,
  nodePath: string,
  fixture: VitestFixture,
): Promise<string> {
  const evidenceFile = nodeEvidencePath(nodePath);
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
