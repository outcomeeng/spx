/**
 * Level 1: Unit tests for tree validation
 * Story: story-54_tree-validation
 */
import type { WorkItemTree } from "@/tree/types";
import { TreeValidationError, validateTree } from "@/tree/validate";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from "@/types";
import { buildSimpleTree, buildTreeWithFeatures, buildTreeWithStories, createNode } from "@test/harness/tree-builder";
import { describe, expect, it } from "vitest";

describe("validateTree", () => {
  /**
   * Level 1: Pure structure validation
   */

  it("GIVEN valid simple tree WHEN validating THEN does not throw", () => {
    // Given
    const tree = buildSimpleTree();

    // When/Then
    expect(() => validateTree(tree)).not.toThrow();
  });

  it("GIVEN valid tree with features WHEN validating THEN does not throw", () => {
    // Given
    const tree = buildTreeWithFeatures();

    // When/Then
    expect(() => validateTree(tree)).not.toThrow();
  });

  it("GIVEN valid tree with stories WHEN validating THEN does not throw", () => {
    // Given
    const tree = buildTreeWithStories();

    // When/Then
    expect(() => validateTree(tree)).not.toThrow();
  });
});

describe("validateTree - Duplicate BSP numbers", () => {
  it("GIVEN duplicate BSP numbers at capability level WHEN validating THEN throws error", () => {
    // Given: Two capabilities with same number
    const cap1 = createNode(WORK_ITEM_KINDS[0], 20, "test1", WORK_ITEM_STATUSES[2]);
    const cap2 = createNode(WORK_ITEM_KINDS[0], 20, "test2", WORK_ITEM_STATUSES[2]);
    const tree: WorkItemTree = { nodes: [cap1, cap2] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });

  it("GIVEN duplicate BSP numbers at feature level WHEN validating THEN throws error", () => {
    // Given: Two features with same number under one capability
    const feat1 = createNode(WORK_ITEM_KINDS[1], 21, "test1", WORK_ITEM_STATUSES[2]);
    const feat2 = createNode(WORK_ITEM_KINDS[1], 21, "test2", WORK_ITEM_STATUSES[2]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat1, feat2]);
    const tree: WorkItemTree = { nodes: [cap] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });

  it("GIVEN duplicate BSP numbers at story level WHEN validating THEN throws error", () => {
    // Given: Two stories with same number under one feature
    const story1 = createNode(WORK_ITEM_KINDS[2], 21, "test1", WORK_ITEM_STATUSES[2]);
    const story2 = createNode(WORK_ITEM_KINDS[2], 21, "test2", WORK_ITEM_STATUSES[2]);
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [story1, story2]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat]);
    const tree: WorkItemTree = { nodes: [cap] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/duplicate/i);
  });
});

describe("validateTree - Hierarchy constraints", () => {
  it("GIVEN story not under feature WHEN validating THEN throws error", () => {
    // Given: Story directly under capability
    const story = createNode(WORK_ITEM_KINDS[2], 21, "orphan", WORK_ITEM_STATUSES[2]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [story]);
    const tree: WorkItemTree = { nodes: [cap] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });

  it("GIVEN story with children WHEN validating THEN throws error", () => {
    // Given: Story with children (stories should be leaf nodes)
    const childStory = createNode(WORK_ITEM_KINDS[2], 32, "child", WORK_ITEM_STATUSES[2]);
    const parentStory = createNode(WORK_ITEM_KINDS[2], 21, "parent", WORK_ITEM_STATUSES[2], [
      childStory,
    ]);
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [parentStory]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat]);
    const tree: WorkItemTree = { nodes: [cap] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
    expect(() => validateTree(tree)).toThrow(/leaf/i);
  });

  it("GIVEN feature not under capability WHEN validating THEN throws error", () => {
    // Given: Feature at root level
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "orphan", WORK_ITEM_STATUSES[2]);
    const tree: WorkItemTree = { nodes: [feat] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });

  it("GIVEN capability under another capability WHEN validating THEN throws error", () => {
    // Given: Capability nested under another capability
    const nestedCap = createNode(WORK_ITEM_KINDS[0], 21, "nested", WORK_ITEM_STATUSES[2]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [nestedCap]);
    const tree: WorkItemTree = { nodes: [cap] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/hierarchy/i);
  });
});

describe("validateTree - Cycle detection", () => {
  it("GIVEN tree with cycle WHEN validating THEN throws error", () => {
    // Given: Create a cycle by manually creating a child with same path as ancestor
    const story = createNode(WORK_ITEM_KINDS[2], 21, "test", WORK_ITEM_STATUSES[2]);
    const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [story]);
    const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat]);

    // Manually create a cycle: make story's path match capability's path
    // This simulates a cycle where a descendant has the same path as an ancestor
    story.path = cap.path;

    const tree: WorkItemTree = { nodes: [cap] };

    // When/Then
    expect(() => validateTree(tree)).toThrow(TreeValidationError);
    expect(() => validateTree(tree)).toThrow(/cycle/i);
  });
});
