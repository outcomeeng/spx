/**
 * Real build checkouts for the build identity and the packaged executable that reports it.
 *
 * The harness arranges a temporary directory in one build state — outside any Git checkout, or a
 * real Git checkout whose single commit carries a given tag relation and whose tracked files are
 * clean or modified — and hands the test the directory and the commit it built. Every checkout also
 * carries an untracked file, so a state counts as modified only through its tracked files.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { execa } from "execa";

import { RELEASE_TAG_PREFIX } from "@/lib/git/release";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import {
  BUILD_COMMIT_TAG_RELATION,
  BUILD_WORKING_TREE_STATE,
  type BuildCommitTagRelation,
  type BuildState,
  type BuildVersions,
} from "@testing/generators/cli/build-identity";
import { CLI_PATH, NODE_EXECUTABLE, PRODUCT_ROOT, VERSION_FLAG } from "@testing/harnesses/constants";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const BUILD_CHECKOUT_TEMP_PREFIX = "spx-build-identity-";
const TRACKED_FILE = "tracked.txt";
const UNTRACKED_FILE = "untracked.txt";
const TRACKED_CONTENT = "committed\n";
const MODIFIED_TRACKED_CONTENT = "modified after commit\n";
const UNTRACKED_CONTENT = "never added\n";
const COMMIT_MESSAGE = "build fixture";
const PACKAGE_MANIFEST = "package.json";
const UTF8 = "utf8";

/** A directory arranged in one build state. */
export interface BuildCheckout {
  readonly dir: string;
  /** The full SHA of the built commit, or null outside a checkout. */
  readonly headCommit: string | null;
}

/**
 * Arranges a temporary directory in `state` for `versions`, runs `callback` against it, and
 * removes the directory afterwards.
 */
export async function withBuildCheckout<T>(
  state: BuildState,
  versions: BuildVersions,
  callback: (checkout: BuildCheckout) => Promise<T>,
): Promise<T> {
  return withTempDir(BUILD_CHECKOUT_TEMP_PREFIX, async (dir) => {
    if (!state.insideCheckout) {
      return callback({ dir, headCommit: null });
    }
    await runGit(dir, [GIT_TEST_SUBCOMMANDS.INIT, GIT_TEST_FLAGS.QUIET]);
    await runGit(dir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
    await runGit(dir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
    await writeFile(join(dir, TRACKED_FILE), TRACKED_CONTENT);
    await runGit(dir, [GIT_TEST_SUBCOMMANDS.ADD, TRACKED_FILE]);
    await runGit(dir, [
      GIT_TEST_SUBCOMMANDS.COMMIT,
      GIT_TEST_FLAGS.QUIET,
      GIT_TEST_FLAGS.COMMIT_MESSAGE,
      COMMIT_MESSAGE,
    ]);
    const tag = tagFor(state.tagRelation, versions);
    if (tag !== null) {
      await runGit(dir, [GIT_TEST_SUBCOMMANDS.TAG, tag]);
    }
    await writeFile(join(dir, UNTRACKED_FILE), UNTRACKED_CONTENT);
    if (state.workingTree === BUILD_WORKING_TREE_STATE.MODIFIED) {
      await writeFile(join(dir, TRACKED_FILE), MODIFIED_TRACKED_CONTENT);
    }
    const headCommit = await readGit(dir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
    return callback({ dir, headCommit });
  });
}

function tagFor(
  relation: BuildCommitTagRelation,
  versions: BuildVersions,
): string | null {
  switch (relation) {
    case BUILD_COMMIT_TAG_RELATION.RELEASE_TAG:
      return `${RELEASE_TAG_PREFIX}${versions.packageVersion}`;
    case BUILD_COMMIT_TAG_RELATION.OTHER_RELEASE_TAG:
      return `${RELEASE_TAG_PREFIX}${versions.otherVersion}`;
    case BUILD_COMMIT_TAG_RELATION.UNTAGGED:
      return null;
  }
}

/** Runs the packaged executable's `--version` from `cwd` and returns what it printed. */
export async function runPackagedVersion(cwd: string): Promise<string> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, VERSION_FLAG], {
    cwd,
    env: buildGitTestEnvironment(),
    extendEnv: false,
  });
  return result.stdout.trim();
}

/** The package version the product manifest declares. */
export async function readProductPackageVersion(): Promise<string> {
  const manifest: unknown = JSON.parse(await readFile(join(PRODUCT_ROOT, PACKAGE_MANIFEST), UTF8));
  if (
    typeof manifest !== "object" || manifest === null || !("version" in manifest)
    || typeof manifest.version !== "string"
  ) {
    throw new Error(`${PACKAGE_MANIFEST} at ${PRODUCT_ROOT} declares no string version`);
  }
  return manifest.version;
}
