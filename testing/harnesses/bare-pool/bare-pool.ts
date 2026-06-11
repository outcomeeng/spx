import { join } from "node:path";

import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";

const CONTAINER_TEMP_DIR_PREFIX = "spx-bare-pool-";
const SOURCE_TEMP_DIR_PREFIX = "spx-bare-pool-source-";
const BARE_REPO_SUFFIX = ".git";
const GIT_ENV_PREFIX = "GIT_";
const INITIAL_COMMIT_MESSAGE = "init";
const REMOTE_ORIGIN_URL_KEY = "remote.origin.url";
const WORKTREE_ADD_SUBCOMMAND = "add";
const CLONE_SUBCOMMAND = "clone";
const BARE_FLAG = "--bare";
const HEAD_REV = "HEAD";

/**
 * The variable inputs for one bare-repository pool: the `origin` repository name
 * the main checkout is named after, the bare directory name, the feature
 * worktree's directory and branch, and the `origin` URL whose repository name
 * equals `repoName`. Supplied by a generator, never hand-written in a test.
 */
export type BarePoolSpec = {
  readonly repoName: string;
  readonly bareName: string;
  readonly featureDir: string;
  readonly featureBranch: string;
  readonly originUrl: string;
};

/** The two worktrees a provisioned bare pool exposes to a test. */
export type BarePoolEnv = {
  /** `<container>/<repoName>` — the worktree named after the `origin` repository. */
  readonly mainCheckoutDir: string;
  /** `<container>/<featureDir>` — a worktree on a feature branch. */
  readonly featureWorktreeDir: string;
};

type CapturedGitEnv = ReadonlyMap<string, string | undefined>;

/**
 * Provisions a real bare-repository worktree pool in a temp directory: a bare
 * clone beside a `<repoName>` main checkout and a `<featureDir>` feature
 * worktree, with `origin` set so `git remote get-url origin` resolves
 * `spec.repoName` from every worktree. The callback receives both worktree
 * paths; the temp directories are removed before this returns.
 */
export async function withBarePoolEnv(
  spec: BarePoolSpec,
  callback: (env: BarePoolEnv) => Promise<void>,
): Promise<void> {
  const container = await createTempDir(CONTAINER_TEMP_DIR_PREFIX);
  const source = await createTempDir(SOURCE_TEMP_DIR_PREFIX);
  const captured = captureAndStripProcessGitEnv();

  let callbackError: unknown;
  let callbackThrew = false;
  let cleanupError: unknown;
  let cleanupFailed = false;
  try {
    const bareDir = join(container, `${spec.bareName}${BARE_REPO_SUFFIX}`);
    const mainCheckoutDir = join(container, spec.repoName);
    const featureWorktreeDir = join(container, spec.featureDir);

    await initSourceRepo(source);
    const headSha = await readGit(source, [GIT_TEST_SUBCOMMANDS.REV_PARSE, HEAD_REV]);

    await runGit(container, [CLONE_SUBCOMMAND, BARE_FLAG, source, bareDir]);
    await runGit(bareDir, [GIT_TEST_SUBCOMMANDS.CONFIG, REMOTE_ORIGIN_URL_KEY, spec.originUrl]);
    await runGit(bareDir, [GIT_TEST_SUBCOMMANDS.WORKTREE, WORKTREE_ADD_SUBCOMMAND, mainCheckoutDir, headSha]);
    await runGit(bareDir, [
      GIT_TEST_SUBCOMMANDS.WORKTREE,
      WORKTREE_ADD_SUBCOMMAND,
      GIT_TEST_FLAGS.NEW_BRANCH,
      spec.featureBranch,
      featureWorktreeDir,
      headSha,
    ]);

    await callback({ mainCheckoutDir, featureWorktreeDir });
  } catch (error) {
    callbackError = error;
    callbackThrew = true;
  } finally {
    restoreProcessGitEnv(captured);
    for (const dir of [container, source]) {
      try {
        await removeTempDir(dir);
      } catch (error) {
        if (!cleanupFailed) {
          cleanupError = error;
          cleanupFailed = true;
        }
      }
    }
  }
  if (callbackThrew) {
    throw callbackError;
  }
  if (cleanupFailed) {
    throw cleanupError;
  }
}

async function initSourceRepo(source: string): Promise<void> {
  await runGit(source, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runGit(source, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(source, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
  await runGit(source, [
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    INITIAL_COMMIT_MESSAGE,
  ]);
}

function captureAndStripProcessGitEnv(): CapturedGitEnv {
  const captured = new Map<string, string | undefined>();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith(GIT_ENV_PREFIX)) {
      captured.set(key, process.env[key]);
      delete process.env[key];
    }
  }
  return captured;
}

function restoreProcessGitEnv(captured: CapturedGitEnv): void {
  for (const [key, value] of captured) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
