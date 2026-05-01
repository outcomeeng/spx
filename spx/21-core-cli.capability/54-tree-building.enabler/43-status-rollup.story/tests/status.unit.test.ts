import { buildTree, TreeBuildDeps } from "@/lib/spec-legacy/tree/build";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES, type WorkItem } from "@/lib/spec-legacy/types";
import { describe, expect, it } from "vitest";

/**
 * Helper to create WorkItem with path
 */
function createWorkItemWithPath(
  kind: (typeof WORK_ITEM_KINDS)[number],
  number: number,
  slug: string,
  path: string,
): WorkItem {
  return {
    kind,
    number,
    slug,
    path,
  };
}

describe("buildTree - Status Rollup", () => {
  describe("GIVEN all children DONE", () => {
    it("WHEN rolling up status THEN parent is DONE", async () => {
      // Given - status map: parent DONE and all features are DONE
      // Per rollup rules: DONE requires ownStatus DONE AND all children DONE
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": WORK_ITEM_STATUSES[2], // Parent must be DONE for rollup to DONE
        "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
        "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[2],
      };

      const testDeps: TreeBuildDeps = {
        getStatus: async (path) => statusMap[path] || WORK_ITEM_STATUSES[0],
      };

      const workItems: WorkItem[] = [
        createWorkItemWithPath(
          WORK_ITEM_KINDS[0],
          20,
          "test",
          "/specs/capability-21_test",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          32,
          "feat1",
          "/specs/capability-21_test/feature-32_feat1",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          43,
          "feat2",
          "/specs/capability-21_test/feature-43_feat2",
        ),
      ];

      // When
      const tree = await buildTree(workItems, testDeps);

      // Then - parent should be DONE (all children DONE)
      expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[2]);
    });
  });

  describe("GIVEN any child IN_PROGRESS", () => {
    it("WHEN rolling up status THEN parent is IN_PROGRESS", async () => {
      // Given - one feature is IN_PROGRESS
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": WORK_ITEM_STATUSES[0],
        "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
        "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[1],
      };

      const testDeps: TreeBuildDeps = {
        getStatus: async (path) => statusMap[path] || WORK_ITEM_STATUSES[0],
      };

      const workItems: WorkItem[] = [
        createWorkItemWithPath(
          WORK_ITEM_KINDS[0],
          20,
          "test",
          "/specs/capability-21_test",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          32,
          "feat1",
          "/specs/capability-21_test/feature-32_feat1",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          43,
          "feat2",
          "/specs/capability-21_test/feature-43_feat2",
        ),
      ];

      // When
      const tree = await buildTree(workItems, testDeps);

      // Then - parent should be IN_PROGRESS (any child IN_PROGRESS)
      expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
    });
  });

  describe("GIVEN mixed DONE and OPEN", () => {
    it("WHEN rolling up status THEN parent is IN_PROGRESS", async () => {
      // Given - mix of DONE and OPEN
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": WORK_ITEM_STATUSES[0],
        "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
        "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[0],
      };

      const testDeps: TreeBuildDeps = {
        getStatus: async (path) => statusMap[path] || WORK_ITEM_STATUSES[0],
      };

      const workItems: WorkItem[] = [
        createWorkItemWithPath(
          WORK_ITEM_KINDS[0],
          20,
          "test",
          "/specs/capability-21_test",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          32,
          "feat1",
          "/specs/capability-21_test/feature-32_feat1",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          43,
          "feat2",
          "/specs/capability-21_test/feature-43_feat2",
        ),
      ];

      // When
      const tree = await buildTree(workItems, testDeps);

      // Then - parent should be IN_PROGRESS (mixed statuses)
      expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
    });
  });

  describe("GIVEN all children OPEN", () => {
    it("WHEN rolling up status THEN parent is OPEN", async () => {
      // Given - parent OPEN and all features are OPEN
      // Per rollup rules: OPEN requires ownStatus OPEN AND all children OPEN
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": WORK_ITEM_STATUSES[0], // Parent must be OPEN for rollup to OPEN
        "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[0],
        "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[0],
      };

      const testDeps: TreeBuildDeps = {
        getStatus: async (path) => statusMap[path] || WORK_ITEM_STATUSES[0],
      };

      const workItems: WorkItem[] = [
        createWorkItemWithPath(
          WORK_ITEM_KINDS[0],
          20,
          "test",
          "/specs/capability-21_test",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          32,
          "feat1",
          "/specs/capability-21_test/feature-32_feat1",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          43,
          "feat2",
          "/specs/capability-21_test/feature-43_feat2",
        ),
      ];

      // When
      const tree = await buildTree(workItems, testDeps);

      // Then - parent should be OPEN (all children OPEN)
      expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[0]);
    });
  });

  describe("GIVEN nested rollup (feature from stories)", () => {
    it("WHEN rolling up status THEN feature aggregates from stories", async () => {
      // Given - stories have mixed status
      const statusMap: Record<string, string> = {
        "/specs/capability-21_test": WORK_ITEM_STATUSES[0],
        "/specs/capability-21_test/feature-32_feat": WORK_ITEM_STATUSES[0],
        "/specs/capability-21_test/feature-32_feat/story-21_story1": WORK_ITEM_STATUSES[2],
        "/specs/capability-21_test/feature-32_feat/story-32_story2": WORK_ITEM_STATUSES[0],
      };

      const testDeps: TreeBuildDeps = {
        getStatus: async (path) => statusMap[path] || WORK_ITEM_STATUSES[0],
      };

      const workItems: WorkItem[] = [
        createWorkItemWithPath(
          WORK_ITEM_KINDS[0],
          20,
          "test",
          "/specs/capability-21_test",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[1],
          32,
          "feat",
          "/specs/capability-21_test/feature-32_feat",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[2],
          21,
          "story1",
          "/specs/capability-21_test/feature-32_feat/story-21_story1",
        ),
        createWorkItemWithPath(
          WORK_ITEM_KINDS[2],
          32,
          "story2",
          "/specs/capability-21_test/feature-32_feat/story-32_story2",
        ),
      ];

      // When
      const tree = await buildTree(workItems, testDeps);

      // Then - feature should be IN_PROGRESS (stories mixed DONE/OPEN)
      expect(tree.nodes[0].children[0].status).toBe(WORK_ITEM_STATUSES[1]);
      // And capability should also be IN_PROGRESS (feature IN_PROGRESS)
      expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
    });
  });
});
