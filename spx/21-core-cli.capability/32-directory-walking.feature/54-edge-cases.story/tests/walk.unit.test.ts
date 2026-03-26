/**
 * Level 1: Unit tests for path normalization
 * Story: story-54_edge-cases
 */
import { normalizePath } from "@/scanner/walk";
import { describe, expect, it } from "vitest";

describe("normalizePath", () => {
  /**
   * Story-54: Edge Cases - Path Normalization
   * Level 1 unit tests for cross-platform path handling
   */

  it("GIVEN Windows path WHEN normalizing THEN uses forward slashes", () => {
    // Given
    const windowsPath = "C:\\Users\\test\\specs\\capability-21_test";

    // When
    const normalized = normalizePath(windowsPath);

    // Then
    expect(normalized).toContain("/");
    expect(normalized).not.toContain("\\");
  });

  it("GIVEN Unix path WHEN normalizing THEN preserves forward slashes", () => {
    // Given
    const unixPath = "/home/user/specs/capability-21_test";

    // When
    const normalized = normalizePath(unixPath);

    // Then
    expect(normalized).toBe(unixPath);
  });
});
