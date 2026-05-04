/**
 * Level 1: Pure function tests for file categorization
 * Story: story-21_file-categorization
 *
 * All functions are pure string manipulation with no filesystem access.
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { categorizeFile, FILE_CATEGORIES, FILE_PATTERNS, filterTestRelevantFiles } from "@/lib/precommit/categorize";

describe("categorizeFile", () => {
  describe("test file detection", () => {
    it("any path containing the test file suffix maps to 'test' regardless of surrounding segments", () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (prefix, suffix) => {
          expect(categorizeFile(`${prefix}${FILE_PATTERNS.TEST_FILE_SUFFIX}${suffix}`)).toBe(FILE_CATEGORIES.TEST);
        }),
      );
    });
  });

  describe("source file detection", () => {
    it("GIVEN source file path WHEN categorizing THEN returns 'source'", () => {
      // Given
      const filePath = `${FILE_PATTERNS.SOURCE_DIR}validation/runner.ts`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.SOURCE);
    });

    it("GIVEN deeply nested source file WHEN categorizing THEN returns 'source'", () => {
      // Given
      const filePath = `${FILE_PATTERNS.SOURCE_DIR}cli/commands/build.ts`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.SOURCE);
    });

    it("GIVEN source index file WHEN categorizing THEN returns 'source'", () => {
      // Given
      const filePath = `${FILE_PATTERNS.SOURCE_DIR}index.ts`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.SOURCE);
    });
  });

  describe("other file detection", () => {
    it("GIVEN README.md WHEN categorizing THEN returns 'other'", () => {
      // Given
      const filePath = "README.md";

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.OTHER);
    });

    it("GIVEN package.json WHEN categorizing THEN returns 'other'", () => {
      // Given
      const filePath = "package.json";

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.OTHER);
    });

    it("GIVEN .gitignore WHEN categorizing THEN returns 'other'", () => {
      // Given
      const filePath = ".gitignore";

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.OTHER);
    });

    it("GIVEN config file WHEN categorizing THEN returns 'other'", () => {
      // Given
      const filePath = "vitest.config.ts";

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.OTHER);
    });

    it("GIVEN docs file WHEN categorizing THEN returns 'other'", () => {
      // Given
      const filePath = "docs/testing/standards.md";

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.OTHER);
    });
  });
});

describe("filterTestRelevantFiles", () => {
  it("GIVEN mixed files WHEN filtering THEN keeps source files", () => {
    // Given
    const files = [
      `${FILE_PATTERNS.SOURCE_DIR}foo.ts`,
      "README.md",
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).toContain(`${FILE_PATTERNS.SOURCE_DIR}foo.ts`);
  });

  it("GIVEN mixed files WHEN filtering THEN keeps test files", () => {
    // Given
    const testFile = `spx/foo.enabler/tests/foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`;
    const files = [testFile, "package.json"];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).toContain(testFile);
  });

  it("GIVEN mixed files WHEN filtering THEN excludes README.md", () => {
    // Given
    const ignoredFile = "README.md";
    const files = [
      `${FILE_PATTERNS.SOURCE_DIR}foo.ts`,
      ignoredFile,
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).not.toContain(ignoredFile);
  });

  it("GIVEN mixed files WHEN filtering THEN excludes package.json", () => {
    // Given
    const ignoredFile = "package.json";
    const files = [
      `${FILE_PATTERNS.SOURCE_DIR}foo.ts`,
      ignoredFile,
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).not.toContain(ignoredFile);
  });

  it("GIVEN only non-test-relevant files WHEN filtering THEN returns empty array", () => {
    // Given
    const files = [
      "README.md",
      "package.json",
      ".gitignore",
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).toEqual([]);
  });

  it("GIVEN empty array WHEN filtering THEN returns empty array", () => {
    // Given
    const files: string[] = [];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).toEqual([]);
  });

  it("GIVEN comprehensive mixed files WHEN filtering THEN returns only test and source files", () => {
    // Given
    const sourceFile = `${FILE_PATTERNS.SOURCE_DIR}foo.ts`;
    const testFile = `spx/foo.enabler/tests/foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`;
    const files = [
      sourceFile,
      testFile,
      "README.md",
      "package.json",
      ".gitignore",
      "docs/testing.md",
      "vitest.config.ts",
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).toHaveLength(2);
    expect(relevant).toContain(sourceFile);
    expect(relevant).toContain(testFile);
  });
});
