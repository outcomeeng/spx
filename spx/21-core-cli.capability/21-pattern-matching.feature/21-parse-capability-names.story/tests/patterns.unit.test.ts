/**
 * Level 1: Pure function tests for capability pattern matching
 * Story: story-21_parse-capability-names
 */
import { parseWorkItemName } from "@/lib/spec-legacy/scanner/patterns";
import { WORK_ITEM_KINDS } from "@/lib/spec-legacy/types";
import { describe, expect, it } from "vitest";

describe("parseWorkItemName - Capabilities", () => {
  it("GIVEN valid capability name WHEN parsing THEN extracts kind, number, and slug", () => {
    // Given
    const dirName = "capability-21_core-cli";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result).toEqual({
      kind: WORK_ITEM_KINDS[0],
      number: 20,
      slug: "core-cli",
    });
  });

  it("GIVEN capability with multi-word slug WHEN parsing THEN preserves kebab-case", () => {
    // Given
    const dirName = "capability-30_mcp-server-integration";

    // When
    const result = parseWorkItemName(dirName);

    // Then
    expect(result.slug).toBe("mcp-server-integration");
  });

  it("GIVEN capability with uppercase letters WHEN parsing THEN rejects pattern", () => {
    // Given
    const dirName = "capability-21_CoreCLI";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow("Invalid work item name");
  });

  it("GIVEN capability with invalid number WHEN parsing THEN rejects pattern", () => {
    // Given
    const dirName = "capability-5_too-low";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow("BSP number must be between 10 and 99");
  });

  it("GIVEN non-capability pattern WHEN parsing THEN returns error", () => {
    // Given
    const dirName = "random-directory";

    // When/Then
    expect(() => parseWorkItemName(dirName)).toThrow("Invalid work item name");
  });
});
