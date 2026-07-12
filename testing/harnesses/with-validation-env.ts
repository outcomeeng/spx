import { cp, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root resolved from this helper's location */
const PRODUCT_ROOT = resolve(__dirname, "../..");
const FIXTURES_PATH = resolve(__dirname, "../fixtures");

/**
 * Fixture project constants for validation tests.
 * These fixtures are minimal projects with specific validation failures.
 */
/**
 * Default timeout for tests using the test harness.
 * Symlinked node_modules makes setup fast, but validation tools still need time.
 */
export const HARNESS_TIMEOUT = 30_000;
export const VALIDATION_FIXTURE_TEXT_ENCODING = "utf8";

export const PROJECT_FIXTURES = {
  WITH_TYPE_ERRORS: "projects/with-type-errors",
  WITH_LINT_ERRORS: "projects/with-lint-errors",
  WITH_CIRCULAR_DEPS: "projects/with-circular-deps",
  WITH_TYPE_ONLY_CIRCULAR_DEPS: "projects/with-type-only-circular-deps",
  CLEAN_PROJECT: "projects/clean-project",
  PYTHON_PROJECT: "projects/python-project",
  BARE_PROJECT: "projects/bare-project",
  TYPESCRIPT_NO_ESLINT: "projects/typescript-no-eslint",
  TYPESCRIPT_NO_TSCONFIG: "projects/typescript-no-tsconfig",
} as const;

export type FixtureName = (typeof PROJECT_FIXTURES)[keyof typeof PROJECT_FIXTURES];

/**
 * Test environment context provided to test callbacks.
 */
export interface TestEnvContext {
  /** Absolute path to the temporary test directory containing the fixture project */
  path: string;
}

/**
 * Options for creating a test environment.
 */
export interface TestEnvOptions {
  /** Name of the fixture project to copy from testing/fixtures/projects/ */
  fixture: FixtureName;
}

/**
 * Creates an isolated test environment with a fixture project.
 *
 * This harness:
 * 1. Creates a temporary directory
 * 2. Copies the specified fixture project into it
 * 3. Symlinks node_modules from project root (fast, no install needed)
 * 4. Runs the test callback with the temp directory path
 * 5. Cleans up the temp directory after the test (even if test fails)
 *
 * @param opts - Configuration for the test environment
 * @param testFn - Test callback that receives the environment context
 *
 * @example
 * ```typescript
 * await withTestEnv({ fixture: FIXTURES.WITH_TYPE_ERRORS }, async ({ path }) => {
 *   const result = await validateTypeScript({ scope: "full", productDir: path });
 *   expect(result.success).toBe(false);
 * });
 * ```
 */
export function withValidationEnv(
  opts: TestEnvOptions,
  testFn: (context: TestEnvContext) => Promise<void>,
): Promise<void> {
  return withTempDir("spx-test-", async (tempDir) => {
    // Copy fixture project to temp directory
    const fixtureSource = join(FIXTURES_PATH, opts.fixture);
    const fixtureDest = join(tempDir, opts.fixture);

    await cp(fixtureSource, fixtureDest, { recursive: true });
    await runGit(fixtureDest, [GIT_TEST_SUBCOMMANDS.INIT]);

    // Symlink node_modules from project root (fast, no install needed)
    await symlink(join(PRODUCT_ROOT, "node_modules"), join(fixtureDest, "node_modules"));

    // Run test callback with context
    await testFn({ path: fixtureDest });
  });
}
