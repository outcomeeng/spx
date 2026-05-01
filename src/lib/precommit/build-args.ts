/**
 * Pure function to build vitest CLI arguments from staged files.
 *
 * This module constructs the appropriate vitest command-line arguments
 * based on whether the staged files are test files, source files, or a mix.
 *
 * @module precommit/build-args
 */

/**
 * Vitest argument constants.
 * These are verified in tests rather than using literal strings.
 */
export const VITEST_ARGS = {
  /** Run tests once without watch mode */
  RUN: "--run",
  /** Subcommand to run only tests that cover specified source files */
  RELATED: "related",
} as const;

/**
 * File pattern constants for categorizing staged files.
 */
export const FILE_PATTERNS = {
  /** Pattern to match test files */
  TEST_FILE: /\.test\.(ts|tsx|js|jsx)$/,
} as const;

/**
 * Checks if a file path is a test file.
 *
 * @param filePath - The file path to check
 * @returns True if the file is a test file
 */
export function isTestFile(filePath: string): boolean {
  return FILE_PATTERNS.TEST_FILE.test(filePath);
}

/**
 * Builds vitest CLI arguments from a list of staged file paths.
 *
 * The function determines the appropriate arguments based on file types:
 * - Empty files: Returns empty array (no tests to run)
 * - Test files only: Uses --run with file paths
 * - Source files present: Uses `vitest related` subcommand to run only
 *   tests that cover the specified source files
 *
 * @param files - Array of staged file paths
 * @returns Array of vitest CLI arguments
 *
 * @example
 * // Test files only
 * buildVitestArgs(['tests/unit/foo.test.ts'])
 * // => ['--run', 'tests/unit/foo.test.ts']
 *
 * @example
 * // Source files only (uses vitest related)
 * buildVitestArgs(['src/validation/runner.ts'])
 * // => ['related', '--run', 'src/validation/runner.ts']
 *
 * @example
 * // Mixed files (uses vitest related with source files)
 * buildVitestArgs(['src/foo.ts', 'tests/unit/bar.test.ts'])
 * // => ['related', '--run', 'src/foo.ts']
 */
export function buildVitestArgs(files: string[]): string[] {
  if (files.length === 0) {
    return [];
  }

  const testFiles = files.filter((f) => isTestFile(f));
  const sourceFiles = files.filter((f) => !isTestFile(f));

  // If source files are present, use `vitest related` to run only tests
  // that cover those source files (much faster than running all tests)
  if (sourceFiles.length > 0) {
    return [VITEST_ARGS.RELATED, VITEST_ARGS.RUN, ...sourceFiles];
  }

  // Test files only: run those specific tests
  return [VITEST_ARGS.RUN, ...testFiles];
}
