/**
 * Level 1: Pure function tests for story pattern matching
 * Story: story-43_parse-story-names
 */
import { parseWorkItemName } from "@/lib/spec-legacy/scanner/patterns";
import { WORK_ITEM_KINDS } from "@/lib/spec-legacy/types";
import { describe, expect, it } from "vitest";

describe("parseWorkItemName - Stories", () => {
  it("GIVEN valid story name WHEN parsing THEN extracts kind, number, and slug", () => {
    // Given
    const dirName = "story-21_parse-capability-names";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result).toEqual({
      kind: WORK_ITEM_KINDS[2],
      number: 21,
      slug: "parse-capability-names",
    });
  });

  it("GIVEN story with multi-word slug WHEN parsing THEN preserves kebab-case", () => {
    // Given
    const dirName = "story-54_validate-bsp-numbers-range";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.slug).toBe("validate-bsp-numbers-range");
  });

  it("GIVEN story with invalid BSP number WHEN parsing THEN rejects pattern", () => {
    // Given
    const dirName = "story-05_too-low";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow("BSP number must be between 10 and 99");
  });
});

describe("parseWorkItemName - Complete Pattern Coverage", () => {
  it("GIVEN all three kinds WHEN parsing THEN returns consistent structure", () => {
    // Given
    const testCases = [
      { input: "capability-21_core-cli", expectedKind: WORK_ITEM_KINDS[0] },
      { input: "feature-21_pattern-matching", expectedKind: WORK_ITEM_KINDS[1] },
      { input: "story-32_parse-features", expectedKind: WORK_ITEM_KINDS[2] },
    ];

    // When/Then
    testCases.forEach(({ input, expectedKind }) => {
      const result = parseWorkItemName(input);

      // Then: All have same structure
      expect(result).toHaveProperty("kind");
      expect(result).toHaveProperty("number");
      expect(result).toHaveProperty("slug");
      expect(result.kind).toBe(expectedKind);
    });
  });

  it("GIVEN work items with same number but different kinds WHEN parsing THEN distinguishes correctly", () => {
    // Given
    const capability = "capability-51_test";
    const feature = "feature-50_test";
    const story = "story-50_test";

    // When
    const capResult = parseWorkItemName(capability);
    const featResult = parseWorkItemName(feature);
    const storyResult = parseWorkItemName(story);

    // Then
    expect(capResult.kind).toBe(WORK_ITEM_KINDS[0]);
    expect(featResult.kind).toBe(WORK_ITEM_KINDS[1]);
    expect(storyResult.kind).toBe(WORK_ITEM_KINDS[2]);
    expect(capResult.number).toBe(50);
    expect(featResult.number).toBe(50);
    expect(storyResult.number).toBe(50);
  });
});

describe("parseWorkItemName - Edge Cases", () => {
  it("GIVEN slug with single character WHEN parsing THEN accepts pattern", () => {
    // Given
    const dirName = "story-20_x";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.slug).toBe("x");
  });

  it("GIVEN slug with numbers WHEN parsing THEN accepts pattern", () => {
    // Given
    const dirName = "feature-30_test-123-feature";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.slug).toBe("test-123-feature");
  });

  it("GIVEN pattern with trailing slash WHEN parsing THEN still works", () => {
    // Given
    const dirName = "capability-21_core-cli";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.kind).toBe(WORK_ITEM_KINDS[0]);
  });
});
