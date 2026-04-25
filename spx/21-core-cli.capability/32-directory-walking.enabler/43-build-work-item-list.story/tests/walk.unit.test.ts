/**
 * Level 1: Unit tests for building work item lists
 * Story: story-43_build-work-item-list
 */
import { buildWorkItemList } from "@/scanner/walk";
import { WORK_ITEM_KINDS } from "@/types";
import type { DirectoryEntry } from "@/types";
import { describe, expect, it } from "vitest";

describe("buildWorkItemList", () => {
  /**
   * Story-43: Build Work Item List
   * Level 1 unit tests for converting directory entries to WorkItem objects
   */

  it("GIVEN directory entries WHEN building list THEN creates WorkItem objects", () => {
    // Given
    const entries: DirectoryEntry[] = [
      { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli", isDirectory: true },
    ];

    // When
    const workItems = buildWorkItemList(entries);

    // Then
    expect(workItems).toHaveLength(1);
    expect(workItems[0]).toEqual({
      kind: WORK_ITEM_KINDS[0],
      number: 20,
      slug: "core-cli",
      path: "/specs/capability-21_core-cli",
    });
  });

  it("GIVEN entries with all three kinds WHEN building list THEN parses each correctly", () => {
    // Given
    const entries: DirectoryEntry[] = [
      { name: "capability-21_test", path: "/specs/capability-21_test", isDirectory: true },
      { name: "feature-32_test", path: "/specs/cap/feature-32_test", isDirectory: true },
      { name: "story-43_test", path: "/specs/cap/feat/story-43_test", isDirectory: true },
    ];

    // When
    const workItems = buildWorkItemList(entries);

    // Then
    expect(workItems).toHaveLength(3);
    expect(workItems[0].kind).toBe(WORK_ITEM_KINDS[0]);
    expect(workItems[1].kind).toBe(WORK_ITEM_KINDS[1]);
    expect(workItems[2].kind).toBe(WORK_ITEM_KINDS[2]);
  });

  it("GIVEN invalid directory entry WHEN building list THEN throws error", () => {
    // Given
    const entries: DirectoryEntry[] = [
      { name: "invalid-pattern", path: "/specs/invalid-pattern", isDirectory: true },
    ];

    // When/Then
    expect(() => buildWorkItemList(entries)).toThrow("Invalid work item name");
  });

  it("GIVEN empty entries array WHEN building list THEN returns empty array", () => {
    // Given
    const entries: DirectoryEntry[] = [];

    // When
    const workItems = buildWorkItemList(entries);

    // Then
    expect(workItems).toEqual([]);
  });
});
