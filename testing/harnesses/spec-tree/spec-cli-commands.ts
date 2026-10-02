import { existsSync } from "node:fs";
import { join } from "node:path";

import { createNodeOutcomeResolver } from "@/commands/spec/node-outcome-resolver";
import type { GitDependencies } from "@/lib/git/root";
import {
  classifyNodeStatus,
  hasNodeStatusVerificationReferences,
  NODE_STATUS_FILENAME,
  type NodeOutcomeResolver,
  type NodeStatusFile,
} from "@/lib/node-status";
import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree";
import { testingRegistry } from "@/test/registry";
import {
  type RepresentativeSpecTreeFixture,
  sampleSpecTreeTestValue,
  SPEC_TREE_TEST_GENERATOR,
  specTreeFixtureNodeDirectoryName,
} from "@testing/generators/spec-tree/spec-tree";
import { GIT_TEST_CONFIG, GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import type { CurrentSpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { type VitestFixture, writeVitestFixture } from "@testing/harnesses/testing/typescript-runner";

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

/** A TypeScript spec-tree evidence path (`<slug>.<mode>.<level>.test.ts`) under `nodePath`'s tests directory. */
function nodeEvidencePath(nodePath: string): string {
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
