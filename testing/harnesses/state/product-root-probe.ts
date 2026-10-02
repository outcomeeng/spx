import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GitCommonDirProductDirResult, GitProductDirResult } from "@/lib/git/root";
import { type GitTestEnvironmentOverrides, runTsxEval } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PRODUCT_ROOT_TEST_CWD_ENV = "SPX_PRODUCT_ROOT_TEST_CWD";

/** Prefix of the temporary directory {@link withNonGitDirectory} creates outside any repository. */
const NON_GIT_DIRECTORY_PREFIX = "spx-non-git-directory-";

/**
 * Base for the nonexistent git paths {@link POLLUTED_GIT_ENVIRONMENT} points at.
 * Derived from the OS temp directory instead of a hardcoded publicly-writable
 * `/tmp` literal, and never created on disk — the paths exist only as env values
 * the resolver must prove it ignores, so no temporary file is ever written.
 */
const NONEXISTENT_GIT_REPO_BASE = join(tmpdir(), "spx-nonexistent-git-repo");

/** Git environment pointing at a nonexistent repository, to prove the resolver ignores inherited git env. */
export const POLLUTED_GIT_ENVIRONMENT: GitTestEnvironmentOverrides = {
  GIT_DIR: join(NONEXISTENT_GIT_REPO_BASE, "git-dir"),
  GIT_WORK_TREE: join(NONEXISTENT_GIT_REPO_BASE, "git-work-tree"),
};

/**
 * Resolver results observed by {@link detectProductRootsInChildProcess}: each
 * resolver's complete result, so a test can tell the git-success path from the
 * non-git fallback through `isGitRepo`, `warning`, and `worktreeRoot`.
 */
export interface DetectedProductRoots {
  readonly worktree: GitProductDirResult;
  readonly gitCommonDir: GitCommonDirProductDirResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasProductDirShape(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.productDir === "string" && typeof value.isGitRepo === "boolean";
}

function parseDetectedProductRoots(stdout: string): DetectedProductRoots {
  const parsed: unknown = JSON.parse(stdout);
  if (
    !isRecord(parsed)
    || !hasProductDirShape(parsed.worktree)
    || !hasProductDirShape(parsed.gitCommonDir)
    || typeof parsed.gitCommonDir.worktreeRoot !== "string"
  ) {
    throw new TypeError("Product root child process returned invalid JSON");
  }
  return {
    worktree: parsed.worktree as unknown as GitProductDirResult,
    gitCommonDir: parsed.gitCommonDir as unknown as GitCommonDirProductDirResult,
  };
}

/**
 * Runs the real product-root resolvers in a child process under the supplied
 * environment overrides, returning each resolver's complete result. The child process
 * isolates env mutation — inherited `GIT_DIR`/`GIT_WORK_TREE`, for instance —
 * from the test runner's own process so the resolvers' git-environment handling
 * is observed without leaking into other tests. The child imports the resolvers
 * through the `@/` path alias so a module rename stays tsconfig-managed.
 */
export async function detectProductRootsInChildProcess(
  cwd: string,
  envOverrides: GitTestEnvironmentOverrides,
): Promise<DetectedProductRoots> {
  const script = `
    import { detectWorktreeProductRoot, detectGitCommonDirProductRoot } from "@/lib/git/root";
    async function main() {
      const cwd = process.env.${PRODUCT_ROOT_TEST_CWD_ENV};
      if (cwd === undefined) {
        throw new Error("Missing ${PRODUCT_ROOT_TEST_CWD_ENV}");
      }
      const worktree = await detectWorktreeProductRoot(cwd);
      const gitCommonDir = await detectGitCommonDirProductRoot(cwd);
      console.log(JSON.stringify({ worktree, gitCommonDir }));
    }
    main().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  const stdout = await runTsxEval(process.cwd(), script, {
    ...envOverrides,
    [PRODUCT_ROOT_TEST_CWD_ENV]: cwd,
  });
  return parseDetectedProductRoots(stdout);
}

/**
 * Creates a fresh directory under the OS temp directory — outside every git
 * repository — invokes the callback with its path, and removes the directory on
 * both the return and throw paths, so a resolver's non-git fallback runs against
 * a real directory.
 */
export async function withNonGitDirectory<T>(callback: (dir: string) => Promise<T>): Promise<T> {
  return withTempDir(NON_GIT_DIRECTORY_PREFIX, callback);
}
