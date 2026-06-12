import { join } from "node:path";

import {
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_REF,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const CONTAINER_PREFIX = "spx-worktree-layout-";
const SOURCE_PREFIX = "spx-worktree-layout-source-";
const BARE_REPO_SUFFIX = ".git";
const DEFAULT_BARE_NAME = "repo";
const GIT_ENV_PREFIX = "GIT_";
/** Commit message for the harness's seed commit — a fixture value, not a git CLI token. */
const INITIAL_COMMIT_MESSAGE = "init";

/** One worktree to provision under the layout's container. */
export type WorktreeSpec = {
  /** Directory basename of the worktree under the container. */
  readonly name: string;
  /** Branch to check out; omitted means detached at the base commit. */
  readonly branch?: string;
};

/**
 * A git worktree layout to provision for real against the filesystem, modeling
 * git directly: bareness, an optional `origin` URL, and the worktrees that exist.
 * The three layouts the main-checkout detector classifies are configurations of
 * this one shape — a single-tree non-bare repository is `{ bare: false, worktrees:
 * [main] }`, a non-bare repository with linked worktrees adds more entries, and a
 * bare-repository pool is `{ bare: true, ... }`. Negative cases fall out: omit
 * `origin`, or omit the repository-named worktree.
 */
export type WorktreeLayoutSpec = {
  /** Bare-repository pool (`true`) or non-bare repository (`false`). */
  readonly bare: boolean;
  /** The bare repository's directory name (pool only); defaults to `repo`. */
  readonly bareName?: string;
  /** The `origin` remote URL set on the repository; omitted leaves `origin` unset. */
  readonly origin?: string;
  /** Worktrees to provision. For a non-bare repository the first entry is the main working tree. */
  readonly worktrees: readonly WorktreeSpec[];
};

/** The provisioned layout: the container and each worktree's absolute path by name. */
export type WorktreeLayoutEnv = {
  /** The pool/repository container directory. */
  readonly container: string;
  /** Worktree name → absolute path. */
  readonly worktrees: Readonly<Record<string, string>>;
  /** The absolute path of the named worktree; throws when no such worktree was provisioned. */
  worktree(name: string): string;
};

type CapturedGitEnv = ReadonlyMap<string, string | undefined>;

/**
 * Provisions a real git worktree layout in temp directories, invokes the callback
 * with the container and each worktree's path, and removes the temp directories on
 * both the return and throw paths (composing on `withTempDir`). `GIT_*` process env
 * is stripped for the duration so a developer's git context cannot leak in.
 */
export async function withWorktreeLayoutEnv(
  spec: WorktreeLayoutSpec,
  callback: (env: WorktreeLayoutEnv) => Promise<void>,
): Promise<void> {
  const captured = captureAndStripProcessGitEnv();
  try {
    await withTempDir(CONTAINER_PREFIX, (container) =>
      withTempDir(SOURCE_PREFIX, async (source) => {
        const headSha = await initSourceRepo(source);
        const worktrees = spec.bare
          ? await provisionBarePool(container, source, spec, headSha)
          : await provisionNonBareRepo(container, source, spec, headSha);
        await callback({
          container,
          worktrees,
          worktree(name) {
            const path = worktrees[name];
            if (path === undefined) {
              throw new Error(`No worktree named '${name}' in the provisioned layout`);
            }
            return path;
          },
        });
      }));
  } finally {
    restoreProcessGitEnv(captured);
  }
}

/** Creates a non-bare source repository with one commit and returns its HEAD SHA. */
async function initSourceRepo(source: string): Promise<string> {
  await runGit(source, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runGit(source, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(source, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
  await runGit(source, [
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    INITIAL_COMMIT_MESSAGE,
  ]);
  return readGit(source, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_REF.HEAD_NAME]);
}

async function provisionBarePool(
  container: string,
  source: string,
  spec: WorktreeLayoutSpec,
  headSha: string,
): Promise<Record<string, string>> {
  const bareDir = join(container, `${spec.bareName ?? DEFAULT_BARE_NAME}${BARE_REPO_SUFFIX}`);
  await runGit(container, [GIT_TEST_SUBCOMMANDS.CLONE, GIT_TEST_FLAGS.BARE, source, bareDir]);
  await setOrigin(bareDir, spec.origin);
  const worktrees: Record<string, string> = {};
  for (const wt of spec.worktrees) {
    const path = join(container, wt.name);
    await addWorktree(bareDir, path, wt.branch, headSha);
    worktrees[wt.name] = path;
  }
  return worktrees;
}

async function provisionNonBareRepo(
  container: string,
  source: string,
  spec: WorktreeLayoutSpec,
  headSha: string,
): Promise<Record<string, string>> {
  const [main, ...linked] = spec.worktrees;
  if (main === undefined) {
    throw new Error("A non-bare worktree layout needs at least the main working tree");
  }
  const mainDir = join(container, main.name);
  await runGit(container, [GIT_TEST_SUBCOMMANDS.CLONE, source, mainDir]);
  await setOrigin(mainDir, spec.origin);
  if (main.branch !== undefined) {
    await runGit(mainDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.NEW_BRANCH, main.branch]);
  }
  const worktrees: Record<string, string> = { [main.name]: mainDir };
  for (const wt of linked) {
    const path = join(container, wt.name);
    await addWorktree(mainDir, path, wt.branch, headSha);
    worktrees[wt.name] = path;
  }
  return worktrees;
}

async function setOrigin(repoDir: string, origin: string | undefined): Promise<void> {
  if (origin === undefined) {
    // `git clone` creates remote.origin.url pointing at the temp source, so an
    // omitted origin must actively unset it for the repository to carry no origin
    // (and therefore no repository name). Tolerate the key being absent.
    try {
      await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_FLAGS.UNSET, GIT_TEST_CONFIG.ORIGIN_URL_KEY]);
    } catch {
      // No origin configured on this repository — nothing to unset.
    }
    return;
  }
  await runGit(repoDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.ORIGIN_URL_KEY, origin]);
}

/** Adds a worktree on a new branch, or detached at `headSha` when no branch is given. */
async function addWorktree(
  repoDir: string,
  path: string,
  branch: string | undefined,
  headSha: string,
): Promise<void> {
  const args = branch === undefined
    ? [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, path, headSha]
    : [GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, GIT_TEST_FLAGS.NEW_BRANCH, branch, path, headSha];
  await runGit(repoDir, args);
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
