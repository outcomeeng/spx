/**
 * Level 1: Pure function tests for feature pattern matching
 * Story: story-32_parse-feature-names
 */
import { parseWorkItemName } from "@/lib/spec-legacy/scanner/patterns";
import { WORK_ITEM_KINDS } from "@/lib/spec-legacy/types";
import { describe, expect, it } from "vitest";

describe("parseWorkItemName - Features", () => {
  it("GIVEN valid feature name WHEN parsing THEN extracts kind, number, and slug", () => {
    // Given
    const dirName = "feature-21_pattern-matching";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result).toEqual({
      kind: WORK_ITEM_KINDS[1],
      number: 21,
      slug: "pattern-matching",
    });
  });

  it("GIVEN feature with multi-word slug WHEN parsing THEN preserves kebab-case", () => {
    // Given
    const dirName = "feature-32_directory-walking-integration";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.slug).toBe("directory-walking-integration");
  });

  it("GIVEN capability and feature with same number WHEN parsing THEN distinguishes by kind", () => {
    // Given
    const capabilityName = "capability-21_core-cli";
    const featureName = "feature-20_some-feature";

    // When
    const capResult = parseWorkItemName(capabilityName);
    const featResult = parseWorkItemName(featureName);

    // Then
    expect(capResult.kind).toBe(WORK_ITEM_KINDS[0]);
    expect(featResult.kind).toBe(WORK_ITEM_KINDS[1]);
    expect(capResult.number).toBe(featResult.number);
  });

  it("GIVEN feature with invalid BSP number WHEN parsing THEN rejects pattern", () => {
    // Given
    const dirName = "feature-100_too-high";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow("BSP number must be between 10 and 99");
  });
});

describe("parseWorkItemName - Kind Detection", () => {
  it("GIVEN mixed work items WHEN parsing THEN correctly identifies each kind", () => {
    // Given
    const testCases = [
      { input: "capability-21_test", expectedKind: WORK_ITEM_KINDS[0] },
      { input: "feature-21_test", expectedKind: WORK_ITEM_KINDS[1] },
    ];

    // When/Then
    testCases.forEach(({ input, expectedKind }) => {
      const result = parseWorkItemName(input);
      expect(result.kind).toBe(expectedKind);
    });
  });
});
