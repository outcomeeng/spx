/**
 * Level 2: Integration tests for filesystem operations
 * Story: story-32_detect-tests-dir
 */
import { hasTestsDirectory, isTestsDirectoryEmpty } from "@/status/state";
import { FIXTURES_ROOT } from "@test/harness/constants";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("hasTestsDirectory", () => {
  it("GIVEN work item with tests dir WHEN checking THEN returns true", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/with-tests");

    // When
    const result = await hasTestsDirectory(workItemPath);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN work item without tests dir WHEN checking THEN returns false", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/no-tests");

    // When
    const result = await hasTestsDirectory(workItemPath);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN nonexistent work item path WHEN checking THEN returns false", async () => {
    // Given
    const workItemPath = join(FIXTURES_ROOT, "work-items/does-not-exist");

    // When
    const result = await hasTestsDirectory(workItemPath);

    // Then
    expect(result).toBe(false);
  });
});

describe("isTestsDirectoryEmpty", () => {
  it("GIVEN empty tests dir WHEN checking THEN returns true", async () => {
    // Given
    const testsPath = join(FIXTURES_ROOT, "work-items/empty-tests/tests");

    // When
    const result = await isTestsDirectoryEmpty(testsPath);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN tests dir with test files WHEN checking THEN returns false", async () => {
    // Given
    const testsPath = join(FIXTURES_ROOT, "work-items/with-tests/tests");

    // When
    const result = await isTestsDirectoryEmpty(testsPath);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN tests dir with only DONE.md WHEN checking THEN returns true", async () => {
    // Given
    const testsPath = join(FIXTURES_ROOT, "work-items/only-done/tests");

    // When
    const result = await isTestsDirectoryEmpty(testsPath);

    // Then
    expect(result).toBe(true); // DONE.md doesn't count as "has tests"
  });

  it("GIVEN tests dir with .gitkeep only WHEN checking THEN returns true", async () => {
    // Given: .gitkeep and other dotfiles shouldn't count as test files
    const testsPath = join(FIXTURES_ROOT, "work-items/empty-tests/tests");

    // When
    const result = await isTestsDirectoryEmpty(testsPath);

    // Then
    expect(result).toBe(true); // .gitkeep doesn't count as "has tests"
  });
});
