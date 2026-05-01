/**
 * Level 2: Integration tests for DONE.md detection
 * Story: story-43_parse-done-md
 */
import { hasDoneMd } from "@/lib/spec-legacy/status/state";
import { FIXTURES_PATHS } from "@testing/fixtures";
import { join } from "path";
import { describe, expect, it } from "vitest";

describe("hasDoneMd", () => {
  it("GIVEN tests dir with DONE.md WHEN checking THEN returns true", async () => {
    // Given
    const testsPath = join(FIXTURES_PATHS.SPEC_LEGACY, "work-items/done-item/tests");

    // When
    const result = await hasDoneMd(testsPath);

    // Then
    expect(result).toBe(true);
  });

  it("GIVEN tests dir without DONE.md WHEN checking THEN returns false", async () => {
    // Given
    const testsPath = join(FIXTURES_PATHS.SPEC_LEGACY, "work-items/in-progress/tests");

    // When
    const result = await hasDoneMd(testsPath);

    // Then
    expect(result).toBe(false);
  });

  it("GIVEN DONE.md as directory (not file) WHEN checking THEN returns false", async () => {
    // Given
    const testsPath = join(FIXTURES_PATHS.SPEC_LEGACY, "work-items/done-is-dir/tests");

    // When
    const result = await hasDoneMd(testsPath);

    // Then
    expect(result).toBe(false); // Directory doesn't count
  });

  it("GIVEN DONE.md with different case WHEN checking THEN returns false", async () => {
    // Given
    const testsPath = join(FIXTURES_PATHS.SPEC_LEGACY, "work-items/wrong-case/tests");

    // When
    const result = await hasDoneMd(testsPath);

    // Then
    expect(result).toBe(false); // Case-sensitive
  });
});
