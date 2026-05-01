/**
 * Level 2: Integration tests for recursive directory walking
 * Story: story-21_recursive-walk
 */
import { walkDirectory } from "@/lib/spec-legacy/scanner/walk";
import { FIXTURES_PATH } from "@testing/fixtures";
import { join, resolve, sep } from "path";
import { describe, expect, it } from "vitest";

describe("walkDirectory", () => {
  /**
   * Level 2: Integration tests with real filesystem
   */

  it("GIVEN directory with subdirectories WHEN walking THEN returns all paths", async () => {
    // Given
    const fixtureRoot = join(FIXTURES_PATH, "simple-tree");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.path.startsWith(resolve(fixtureRoot)))).toBe(true);
    expect(entries.every((e) => e.isDirectory)).toBe(true);
  });

  it("GIVEN nested directory structure WHEN walking THEN discovers all levels", async () => {
    // Given
    const fixtureRoot = join(FIXTURES_PATH, "nested-tree");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    const depths = entries.map((e) => e.path.split(sep).length);
    expect(Math.max(...depths)).toBeGreaterThan(3); // Has nested structure
    expect(entries.length).toBeGreaterThanOrEqual(3); // level1, level2, level3
  });

  it("GIVEN empty directory WHEN walking THEN returns empty array", async () => {
    // Given
    const fixtureRoot = join(FIXTURES_PATH, "empty-dir");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    expect(entries).toEqual([]);
  });

  it("GIVEN non-existent directory WHEN walking THEN throws error", async () => {
    // Given
    const nonExistent = "/path/that/does/not/exist";

    // When/Then
    await expect(walkDirectory(nonExistent)).rejects.toThrow();
  });

  it("GIVEN directory WHEN walking THEN returns DirectoryEntry objects", async () => {
    // Given
    const fixtureRoot = join(FIXTURES_PATH, "simple-tree");

    // When
    const entries = await walkDirectory(fixtureRoot);

    // Then
    expect(entries.length).toBeGreaterThan(0);
    entries.forEach((entry) => {
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("path");
      expect(entry).toHaveProperty("isDirectory");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.path).toBe("string");
      expect(entry.isDirectory).toBe(true);
    });
  });
});
