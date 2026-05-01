/**
 * Level 1: Unit tests for pattern filtering
 * Story: story-32_pattern-filter
 */
import { filterWorkItemDirectories } from "@/lib/spec-legacy/scanner/walk";
import { describe, expect, it } from "vitest";

describe("filterWorkItemDirectories", () => {
  it("GIVEN directories with work item names WHEN filtering THEN includes them", () => {
    const entries = [
      { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli", isDirectory: true },
      { name: "feature-32_walk", path: "/specs/cap/feature-32_walk", isDirectory: true },
      { name: "story-21_test", path: "/specs/cap/feat/story-21_test", isDirectory: true },
    ];

    const filtered = filterWorkItemDirectories(entries);

    expect(filtered).toHaveLength(3);
  });

  it("GIVEN directories with non-work-item names WHEN filtering THEN excludes them", () => {
    const entries = [
      { name: "node_modules", path: "/specs/node_modules", isDirectory: true },
      { name: "dist", path: "/specs/dist", isDirectory: true },
      { name: ".git", path: "/specs/.git", isDirectory: true },
      { name: "capability-21_core-cli", path: "/specs/capability-21_core-cli", isDirectory: true },
    ];

    const filtered = filterWorkItemDirectories(entries);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("capability-21_core-cli");
  });

  it("GIVEN mixed valid and invalid patterns WHEN filtering THEN includes only valid", () => {
    const entries = [
      { name: "capability-21_test", path: "/specs/capability-21_test", isDirectory: true },
      { name: "invalid-pattern", path: "/specs/invalid-pattern", isDirectory: true },
      { name: "feature-32_walk", path: "/specs/feature-32_walk", isDirectory: true },
      { name: "README.md", path: "/specs/README.md", isDirectory: true },
    ];

    const filtered = filterWorkItemDirectories(entries);

    expect(filtered).toHaveLength(2);
    expect(filtered.map(f => f.name)).toEqual([
      "capability-21_test",
      "feature-32_walk",
    ]);
  });
});
