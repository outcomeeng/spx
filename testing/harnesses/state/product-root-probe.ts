import { type GitTestEnvironmentOverrides, runTsxEval } from "@testing/harnesses/git-test-constants";

const PRODUCT_ROOT_TEST_CWD_ENV = "SPX_PRODUCT_ROOT_TEST_CWD";

/** Git environment pointing at a nonexistent repository, to prove the resolver ignores inherited git env. */
export const POLLUTED_GIT_ENVIRONMENT: GitTestEnvironmentOverrides = {
  GIT_DIR: "/tmp/nonexistent-git-dir",
  GIT_WORK_TREE: "/tmp/nonexistent-git-work-tree",
};

/** Product roots resolved by {@link detectProductRootsInChildProcess}. */
export interface DetectedProductRoots {
  readonly worktreeProductRoot: string;
  readonly gitCommonDirProductRoot: string;
}

function parseDetectedProductRoots(stdout: string): DetectedProductRoots {
  const parsed = JSON.parse(stdout) as Partial<DetectedProductRoots>;
  if (typeof parsed.worktreeProductRoot !== "string" || typeof parsed.gitCommonDirProductRoot !== "string") {
    throw new Error("Product root child process returned invalid JSON");
  }
  return {
    worktreeProductRoot: parsed.worktreeProductRoot,
    gitCommonDirProductRoot: parsed.gitCommonDirProductRoot,
  };
}

/**
 * Runs the real product-root resolvers in a child process under the supplied
 * environment overrides, returning the resolved roots. The child process
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
    import { detectWorktreeProductRoot, detectGitCommonDirProductRoot } from "@/git/root";
    async function main() {
      const cwd = process.env.${PRODUCT_ROOT_TEST_CWD_ENV};
      if (cwd === undefined) {
        throw new Error("Missing ${PRODUCT_ROOT_TEST_CWD_ENV}");
      }
      const worktreeProductRoot = await detectWorktreeProductRoot(cwd);
      const gitCommonDirProductRoot = await detectGitCommonDirProductRoot(cwd);
      console.log(JSON.stringify({ worktreeProductRoot: worktreeProductRoot.productDir, gitCommonDirProductRoot: gitCommonDirProductRoot.productDir }));
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
