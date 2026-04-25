import { buildTree, type TreeBuildDeps } from "@/tree/build";
import type { WorkItemTree } from "@/tree/types";
import { TreeValidationError, validateTree } from "@/tree/validate";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES, type WorkItem, type WorkItemKind } from "@/types";
import { buildSimpleTree, buildTreeWithFeatures, buildTreeWithStories, createNode } from "@test/harness/tree-builder";
import { describe, expect, it } from "vitest";

function makeItem(kind: WorkItemKind, number: number, slug: string, path: string): WorkItem {
  return { kind, number, slug, path };
}

const openDeps: TreeBuildDeps = {
  getStatus: async () => WORK_ITEM_STATUSES[0],
};

describe("buildTree — parent-child links", () => {
  it("GIVEN capability and nested feature WHEN building tree THEN feature is child of capability", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 20, "test", "/specs/capability-21_test"),
      makeItem(WORK_ITEM_KINDS[1], 32, "feat", "/specs/capability-21_test/feature-32_feat"),
    ];

    const tree = await buildTree(workItems, openDeps);

    expect(tree.nodes).toHaveLength(1);
    expect(tree.nodes[0].kind).toBe(WORK_ITEM_KINDS[0]);
    expect(tree.nodes[0].children).toHaveLength(1);
    expect(tree.nodes[0].children[0].slug).toBe("feat");
  });

  it("GIVEN feature and nested story WHEN building tree THEN story is child of feature", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 20, "test", "/specs/capability-21_test"),
      makeItem(WORK_ITEM_KINDS[1], 32, "feat", "/specs/capability-21_test/feature-32_feat"),
      makeItem(
        WORK_ITEM_KINDS[2],
        21,
        WORK_ITEM_KINDS[2],
        "/specs/capability-21_test/feature-32_feat/story-21_story",
      ),
    ];

    const tree = await buildTree(workItems, openDeps);

    const feature = tree.nodes[0].children[0];
    expect(feature.children).toHaveLength(1);
    expect(feature.children[0].slug).toBe(WORK_ITEM_KINDS[2]);
  });

  it("GIVEN capability with multiple features WHEN building tree THEN all features linked", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 20, "test", "/specs/capability-21_test"),
      makeItem(WORK_ITEM_KINDS[1], 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
      makeItem(WORK_ITEM_KINDS[1], 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
    ];

    const tree = await buildTree(workItems, openDeps);

    expect(tree.nodes[0].children).toHaveLength(2);
  });

  it("GIVEN orphan story with no feature parent WHEN building tree THEN rejects with /orphan|parent/i", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[2], 21, "orphan", "/specs/story-21_orphan"),
    ];

    await expect(buildTree(workItems, openDeps)).rejects.toThrow(/orphan|parent/i);
  });

  it("GIVEN multiple capabilities WHEN building tree THEN all appear at root level", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 20, "cap1", "/specs/capability-21_cap1"),
      makeItem(WORK_ITEM_KINDS[0], 31, "cap2", "/specs/capability-32_cap2"),
    ];

    const tree = await buildTree(workItems, openDeps);

    expect(tree.nodes).toHaveLength(2);
  });
});

describe("buildTree — BSP sorting", () => {
  it("GIVEN features with mixed BSP numbers WHEN building tree THEN sorted ascending", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 20, "test", "/specs/capability-21_test"),
      makeItem(WORK_ITEM_KINDS[1], 65, "feat3", "/specs/capability-21_test/feature-65_feat3"),
      makeItem(WORK_ITEM_KINDS[1], 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
      makeItem(WORK_ITEM_KINDS[1], 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
    ];

    const tree = await buildTree(workItems, openDeps);

    const features = tree.nodes[0].children;
    expect(features.map((f) => f.number)).toEqual([32, 43, 65]);
    expect(features.map((f) => f.slug)).toEqual(["feat1", "feat2", "feat3"]);
  });

  it("GIVEN stories with mixed BSP numbers WHEN building tree THEN sorted ascending", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 20, "test", "/specs/capability-21_test"),
      makeItem(WORK_ITEM_KINDS[1], 32, "feat", "/specs/capability-21_test/feature-32_feat"),
      makeItem(
        WORK_ITEM_KINDS[2],
        54,
        "story3",
        "/specs/capability-21_test/feature-32_feat/story-54_story3",
      ),
      makeItem(
        WORK_ITEM_KINDS[2],
        21,
        "story1",
        "/specs/capability-21_test/feature-32_feat/story-21_story1",
      ),
      makeItem(
        WORK_ITEM_KINDS[2],
        43,
        "story2",
        "/specs/capability-21_test/feature-32_feat/story-43_story2",
      ),
    ];

    const tree = await buildTree(workItems, openDeps);

    const stories = tree.nodes[0].children[0].children;
    expect(stories.map((s) => s.number)).toEqual([21, 43, 54]);
  });

  it("GIVEN multiple capabilities with mixed BSP numbers WHEN building tree THEN sorted ascending", async () => {
    const workItems: WorkItem[] = [
      makeItem(WORK_ITEM_KINDS[0], 31, "cap2", "/specs/capability-32_cap2"),
      makeItem(WORK_ITEM_KINDS[0], 20, "cap1", "/specs/capability-21_cap1"),
      makeItem(WORK_ITEM_KINDS[0], 42, "cap3", "/specs/capability-43_cap3"),
    ];

    const tree = await buildTree(workItems, openDeps);

    expect(tree.nodes.map((c) => c.number)).toEqual([20, 31, 42]);
  });
});

describe("buildTree — status rollup", () => {
  function makeStatusDeps(statusMap: Record<string, string>): TreeBuildDeps {
    return { getStatus: async (p) => statusMap[p] ?? WORK_ITEM_STATUSES[0] };
  }

  const baseItems: WorkItem[] = [
    makeItem(WORK_ITEM_KINDS[0], 20, "test", "/specs/capability-21_test"),
    makeItem(WORK_ITEM_KINDS[1], 32, "feat1", "/specs/capability-21_test/feature-32_feat1"),
    makeItem(WORK_ITEM_KINDS[1], 43, "feat2", "/specs/capability-21_test/feature-43_feat2"),
  ];

  it("GIVEN own DONE and all children DONE WHEN building tree THEN parent is DONE", async () => {
    const deps = makeStatusDeps({
      "/specs/capability-21_test": WORK_ITEM_STATUSES[2],
      "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
      "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[2],
    });

    const tree = await buildTree(baseItems, deps);

    expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[2]);
  });

  it("GIVEN own OPEN and all children DONE WHEN building tree THEN parent is IN_PROGRESS", async () => {
    const deps = makeStatusDeps({
      "/specs/capability-21_test": WORK_ITEM_STATUSES[0],
      "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
      "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[2],
    });

    const tree = await buildTree(baseItems, deps);

    expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
  });

  it("GIVEN own DONE and a child IN_PROGRESS WHEN building tree THEN parent is IN_PROGRESS", async () => {
    const deps = makeStatusDeps({
      "/specs/capability-21_test": WORK_ITEM_STATUSES[2],
      "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
      "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[1],
    });

    const tree = await buildTree(baseItems, deps);

    expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
  });

  it("GIVEN mixed DONE and OPEN children WHEN building tree THEN parent is IN_PROGRESS", async () => {
    const deps = makeStatusDeps({
      "/specs/capability-21_test": WORK_ITEM_STATUSES[0],
      "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[2],
      "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[0],
    });

    const tree = await buildTree(baseItems, deps);

    expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
  });

  it("GIVEN own OPEN and all children OPEN WHEN building tree THEN parent is OPEN", async () => {
    const deps = makeStatusDeps({
      "/specs/capability-21_test": WORK_ITEM_STATUSES[0],
      "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[0],
      "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[0],
    });

    const tree = await buildTree(baseItems, deps);

    expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[0]);
  });

  it("GIVEN own IN_PROGRESS and all children OPEN WHEN building tree THEN parent is IN_PROGRESS", async () => {
    const deps = makeStatusDeps({
      "/specs/capability-21_test": WORK_ITEM_STATUSES[1],
      "/specs/capability-21_test/feature-32_feat1": WORK_ITEM_STATUSES[0],
      "/specs/capability-21_test/feature-43_feat2": WORK_ITEM_STATUSES[0],
    });

    const tree = await buildTree(baseItems, deps);

    expect(tree.nodes[0].status).toBe(WORK_ITEM_STATUSES[1]);
  });
});

describe("validateTree — valid structures", () => {
  it("GIVEN simple tree with one capability WHEN validating THEN does not throw", () => {
    expect(() => validateTree(buildSimpleTree())).not.toThrow();
  });

  it("GIVEN tree with features WHEN validating THEN does not throw", () => {
    expect(() => validateTree(buildTreeWithFeatures())).not.toThrow();
  });

  it("GIVEN tree with stories WHEN validating THEN does not throw", () => {
    expect(() => validateTree(buildTreeWithStories())).not.toThrow();
  });
});

describe("validateTree — duplicate BSP numbers", () => {
  it("GIVEN two capabilities with same BSP number WHEN validating THEN throws /duplicate/i", () => {
    const tree: WorkItemTree = {
      nodes: [
        createNode(WORK_ITEM_KINDS[0], 20, "test1", WORK_ITEM_STATUSES[2]),
        createNode(WORK_ITEM_KINDS[0], 20, "test2", WORK_ITEM_STATUSES[2]),
      ],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });

  it("GIVEN two features with same BSP under one capability WHEN validating THEN throws /duplicate/i", () => {
    const feat1 = createNode(WORK_ITEM_KINDS[1], 21, "test1", WORK_ITEM_STATUSES[2]);
    const feat2 = createNode(WORK_ITEM_KINDS[1], 21, "test2", WORK_ITEM_STATUSES[2]);
    const tree: WorkItemTree = {
      nodes: [createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat1, feat2])],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });

  it("GIVEN two stories with same BSP under one feature WHEN validating THEN throws /duplicate/i", () => {
    const story1 = createNode(WORK_ITEM_KINDS[2], 21, "test1", WORK_ITEM_STATUSES[2]);
    const story2 = createNode(WORK_ITEM_KINDS[2], 21, "test2", WORK_ITEM_STATUSES[2]);
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [
      story1,
      story2,
    ]);
    const tree: WorkItemTree = {
      nodes: [createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat])],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });
});

describe("validateTree — hierarchy constraints", () => {
  it("GIVEN story directly under capability WHEN validating THEN throws TreeValidationError", () => {
    const story = createNode(WORK_ITEM_KINDS[2], 21, "orphan", WORK_ITEM_STATUSES[2]);
    const tree: WorkItemTree = {
      nodes: [createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [story])],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });

  it("GIVEN story with children WHEN validating THEN throws /leaf/i", () => {
    const childStory = createNode(WORK_ITEM_KINDS[2], 32, "child", WORK_ITEM_STATUSES[2]);
    const parentStory = createNode(WORK_ITEM_KINDS[2], 21, "parent", WORK_ITEM_STATUSES[2], [
      childStory,
    ]);
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [parentStory]);
    const tree: WorkItemTree = {
      nodes: [createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat])],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/leaf/i);
  });

  it("GIVEN feature at root level WHEN validating THEN throws TreeValidationError", () => {
    const tree: WorkItemTree = {
      nodes: [createNode(WORK_ITEM_KINDS[1], 21, "orphan", WORK_ITEM_STATUSES[2])],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });

  it("GIVEN capability nested under capability WHEN validating THEN throws TreeValidationError", () => {
    const nestedCap = createNode(WORK_ITEM_KINDS[0], 21, "nested", WORK_ITEM_STATUSES[2]);
    const tree: WorkItemTree = {
      nodes: [createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [nestedCap])],
    };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });
});

describe("validateTree — cycle detection", () => {
  it("GIVEN path collision between ancestor and descendant WHEN validating THEN throws /cycle/i", () => {
    const story = createNode(WORK_ITEM_KINDS[2], 21, "test", WORK_ITEM_STATUSES[2]);
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [story]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat]);
    story.path = cap.path;
    const tree: WorkItemTree = { nodes: [cap] };

    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/cycle/i);
  });
});
