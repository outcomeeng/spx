import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root resolved from this helper's location */
const PROJECT_ROOT = resolve(__dirname, "../..");

/**
 * Fixture project constants for validation tests.
 * These fixtures are minimal projects with specific validation failures.
 */
/**
 * Default timeout for tests using the test harness.
 * Symlinked node_modules makes setup fast, but validation tools still need time.
 */
export const HARNESS_TIMEOUT = 30_000;

export const FIXTURES = {
  WITH_TYPE_ERRORS: "with-type-errors",
  WITH_LINT_ERRORS: "with-lint-errors",
  WITH_CIRCULAR_DEPS: "with-circular-deps",
  CLEAN_PROJECT: "clean-project",
  PYTHON_PROJECT: "python-project",
  BARE_PROJECT: "bare-project",
  TYPESCRIPT_NO_ESLINT: "typescript-no-eslint",
} as const;

export type FixtureName = (typeof FIXTURES)[keyof typeof FIXTURES];

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
  /** Name of the fixture project to copy from tests/fixtures/projects/ */
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
 *   const result = await validateTypeScript(path, ...);
 *   expect(result.success).toBe(false);
 * });
 * ```
 */
export async function withValidationEnv(
  opts: TestEnvOptions,
  testFn: (context: TestEnvContext) => Promise<void>,
): Promise<void> {
  // Create temp directory with unique prefix
  const tempDir = await mkdtemp(join(tmpdir(), "spx-test-"));

  try {
    // Copy fixture project to temp directory
    const fixtureSource = join(PROJECT_ROOT, "tests", "fixtures", "projects", opts.fixture);
    const fixtureDest = join(tempDir, opts.fixture);

    await cp(fixtureSource, fixtureDest, { recursive: true });

    // Symlink node_modules from project root (fast, no install needed)
    await symlink(join(PROJECT_ROOT, "node_modules"), join(fixtureDest, "node_modules"));

    // Run test callback with context
    await testFn({ path: fixtureDest });
  } finally {
    // Always clean up temp directory, even if test fails
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      // Log cleanup errors but don't fail the test
      // tempDir is system-generated via mkdtemp(), not user input - safe for format strings
      console.warn(`Warning: Failed to clean up temp directory ${tempDir}:`, cleanupError); // nosemgrep
    }
  }
}
