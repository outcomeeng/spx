/**
 * Level 1: Pure function tests for file categorization
 * Story: story-21_file-categorization
 *
 * All functions are pure string manipulation with no filesystem access.
 */
import { describe, expect, it } from "vitest";

import {
  categorizeFile,
  FILE_CATEGORIES,
  FILE_PATTERNS,
  filterTestRelevantFiles,
  findRelatedTestPaths,
} from "@/precommit/categorize";

describe("categorizeFile", () => {
  describe("test file detection", () => {
    it("GIVEN unit test file path WHEN categorizing THEN returns 'test'", () => {
      // Given
      const filePath = `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.TEST);
    });

    it("GIVEN integration test file path WHEN categorizing THEN returns 'test'", () => {
      // Given
      const filePath =
        `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.INTEGRATION_DIR}bar${FILE_PATTERNS.INTEGRATION_TEST_SUFFIX}`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.TEST);
    });

    it("GIVEN spec test file path WHEN categorizing THEN returns 'test'", () => {
      // Given
      const filePath = `${FILE_PATTERNS.SPECS_DIR}work/doing/cap-1/tests/baz${FILE_PATTERNS.TEST_FILE_SUFFIX}`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.TEST);
    });

    it("GIVEN deeply nested test file WHEN categorizing THEN returns 'test'", () => {
      // Given
      const filePath =
        `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}scanner/patterns${FILE_PATTERNS.TEST_FILE_SUFFIX}`;

      // When
      const result = categorizeFile(filePath);

      // Then
      expect(result).toBe(FILE_CATEGORIES.TEST);
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

describe("findRelatedTestPaths", () => {
  it("GIVEN source path WHEN finding tests THEN returns unit test path", () => {
    // Given
    const sourcePath = `${FILE_PATTERNS.SOURCE_DIR}validation/runner.ts`;

    // When
    const paths = findRelatedTestPaths(sourcePath);

    // Then
    expect(paths).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}validation/runner${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
    );
  });

  it("GIVEN source path WHEN finding tests THEN returns integration test path", () => {
    // Given
    const sourcePath = `${FILE_PATTERNS.SOURCE_DIR}validation/runner.ts`;

    // When
    const paths = findRelatedTestPaths(sourcePath);

    // Then
    expect(paths).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.INTEGRATION_DIR}validation/runner${FILE_PATTERNS.INTEGRATION_TEST_SUFFIX}`,
    );
  });

  it("GIVEN deeply nested source path WHEN finding tests THEN preserves directory structure", () => {
    // Given
    const sourcePath = `${FILE_PATTERNS.SOURCE_DIR}cli/commands/build.ts`;

    // When
    const paths = findRelatedTestPaths(sourcePath);

    // Then
    expect(paths).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}cli/commands/build${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
    );
    expect(paths).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.INTEGRATION_DIR}cli/commands/build${FILE_PATTERNS.INTEGRATION_TEST_SUFFIX}`,
    );
  });

  it("GIVEN non-source path WHEN finding tests THEN returns empty array", () => {
    // Given
    const nonSourcePath = "README.md";

    // When
    const paths = findRelatedTestPaths(nonSourcePath);

    // Then
    expect(paths).toEqual([]);
  });

  it("GIVEN test file path WHEN finding tests THEN returns empty array", () => {
    // Given
    const testPath = `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`;

    // When
    const paths = findRelatedTestPaths(testPath);

    // Then
    expect(paths).toEqual([]);
  });

  it("GIVEN index.ts source path WHEN finding tests THEN returns correct paths", () => {
    // Given
    const sourcePath = `${FILE_PATTERNS.SOURCE_DIR}index.ts`;

    // When
    const paths = findRelatedTestPaths(sourcePath);

    // Then
    expect(paths).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}index${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
    );
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
    const files = [
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
      "package.json",
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
    );
  });

  it("GIVEN mixed files WHEN filtering THEN excludes README.md", () => {
    // Given
    const files = [
      `${FILE_PATTERNS.SOURCE_DIR}foo.ts`,
      "README.md",
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).not.toContain("README.md");
  });

  it("GIVEN mixed files WHEN filtering THEN excludes package.json", () => {
    // Given
    const files = [
      `${FILE_PATTERNS.SOURCE_DIR}foo.ts`,
      "package.json",
    ];

    // When
    const relevant = filterTestRelevantFiles(files);

    // Then
    expect(relevant).not.toContain("package.json");
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
    const files = [
      `${FILE_PATTERNS.SOURCE_DIR}foo.ts`,
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
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
    expect(relevant).toContain(`${FILE_PATTERNS.SOURCE_DIR}foo.ts`);
    expect(relevant).toContain(
      `${FILE_PATTERNS.TESTS_DIR}${FILE_PATTERNS.UNIT_DIR}foo${FILE_PATTERNS.TEST_FILE_SUFFIX}`,
    );
  });
});

describe("constants verification", () => {
  it("FILE_PATTERNS has expected values", () => {
    expect(FILE_PATTERNS.TEST_FILE_SUFFIX).toBe(".test.ts");
    expect(FILE_PATTERNS.INTEGRATION_TEST_SUFFIX).toBe(".integration.test.ts");
    expect(FILE_PATTERNS.SOURCE_DIR).toBe("src/");
    expect(FILE_PATTERNS.TESTS_DIR).toBe("tests/");
    expect(FILE_PATTERNS.SPECS_DIR).toBe("specs/");
    expect(FILE_PATTERNS.UNIT_DIR).toBe("unit/");
    expect(FILE_PATTERNS.INTEGRATION_DIR).toBe("integration/");
  });

  it("FILE_CATEGORIES has expected values", () => {
    expect(FILE_CATEGORIES.TEST).toBe("test");
    expect(FILE_CATEGORIES.SOURCE).toBe("source");
    expect(FILE_CATEGORIES.OTHER).toBe("other");
  });
});
