/**
 * File categorization utilities for pre-commit test enforcement.
 *
 * Pure functions for categorizing changed files by type (test/source/other)
 * and finding related test paths.
 *
 * @module precommit/categorize
 */

/**
 * File category types for changed files.
 */
export const FILE_CATEGORIES = {
  TEST: "test",
  SOURCE: "source",
  OTHER: "other",
} as const;

export type FileCategory = (typeof FILE_CATEGORIES)[keyof typeof FILE_CATEGORIES];

/**
 * Constants for file categorization patterns.
 * DRY constants that are verified in tests rather than using literal strings.
 */
export const FILE_PATTERNS = {
  /** Pattern to identify test files */
  TEST_FILE_SUFFIX: ".test.ts",
  /** Integration test suffix */
  INTEGRATION_TEST_SUFFIX: ".integration.test.ts",
  /** Source directory prefix */
  SOURCE_DIR: "src/",
  /** Tests directory prefix */
  TESTS_DIR: "tests/",
  /** Specs directory prefix (for spec tests) */
  SPECS_DIR: "specs/",
  /** Unit tests subdirectory */
  UNIT_DIR: "unit/",
  /** Integration tests subdirectory */
  INTEGRATION_DIR: "integration/",
} as const;

/**
 * Categorize a file path as test, source, or other.
 *
 * @param filePath - The file path to categorize
 * @returns The category: 'test', 'source', or 'other'
 *
 * @example
 * ```typescript
 * categorizeFile("tests/unit/foo.test.ts"); // returns "test"
 * categorizeFile("src/validation/runner.ts"); // returns "source"
 * categorizeFile("README.md"); // returns "other"
 * ```
 */
export function categorizeFile(filePath: string): FileCategory {
  // Check if it's a test file (contains .test.ts)
  if (filePath.includes(FILE_PATTERNS.TEST_FILE_SUFFIX)) {
    return FILE_CATEGORIES.TEST;
  }

  // Check if it's a source file (in src/ directory)
  if (filePath.startsWith(FILE_PATTERNS.SOURCE_DIR)) {
    return FILE_CATEGORIES.SOURCE;
  }

  // Everything else is "other"
  return FILE_CATEGORIES.OTHER;
}

/**
 * Filter a list of file paths to only include test-relevant files.
 *
 * Test-relevant files are:
 * - Test files (files ending in .test.ts)
 * - Source files (files in src/ directory)
 *
 * Excludes files like README.md, package.json, .gitignore, etc.
 *
 * @param files - Array of file paths to filter
 * @returns Array of test-relevant file paths
 *
 * @example
 * ```typescript
 * filterTestRelevantFiles([
 *   "src/foo.ts",
 *   "tests/unit/foo.test.ts",
 *   "README.md",
 *   "package.json"
 * ]);
 * // Returns: ["src/foo.ts", "tests/unit/foo.test.ts"]
 * ```
 */
export function filterTestRelevantFiles(files: string[]): string[] {
  return files.filter((file) => {
    const category = categorizeFile(file);
    return category === FILE_CATEGORIES.TEST || category === FILE_CATEGORIES.SOURCE;
  });
}
