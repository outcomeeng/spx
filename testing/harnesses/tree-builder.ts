/**
 * Synthetic tree builders for testing formatters
 *
 * These create fake trees for testing Feature 65 (formatters) without requiring
 * Feature 54 (tree building) to be complete.
 */
import { TreeNode, WorkItemTree } from "@/lib/spec-legacy/tree/types";
import type { WorkItemKind, WorkItemStatus } from "@/lib/spec-legacy/types";
import { WORK_ITEM_KINDS, WORK_ITEM_STATUSES } from "@/lib/spec-legacy/types";

/**
 * Create a synthetic tree node
 *
 * @param kind - Work item type
 * @param number - Internal BSP number
 * @param slug - URL-safe identifier
 * @param status - Work item status
 * @param children - Child nodes (will be BSP-sorted)
 * @returns TreeNode with sorted children
 */
export function createNode(
  kind: WorkItemKind,
  number: number,
  slug: string,
  status: WorkItemStatus,
  children: TreeNode[] = [],
): TreeNode {
  return {
    kind,
    number,
    slug,
    path: `/test/${kind}-${kind === WORK_ITEM_KINDS[0] ? number + 1 : number}_${slug}`,
    status,
    children: children.sort((a, b) => a.number - b.number), // BSP sort
  };
}

/**
 * Build a simple tree with single capability, no children
 *
 * Used by: text, markdown, table formatters
 */
export function buildSimpleTree(): WorkItemTree {
  const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2]);
  return { nodes: [cap] };
}

/**
 * Build tree with capability containing features
 *
 * Structure:
 * - capability-21_test [IN_PROGRESS]
 *   - feature-21_test [DONE]
 *   - feature-32_test [OPEN]
 *
 * Used by: text, markdown formatters
 */
export function buildTreeWithFeatures(): WorkItemTree {
  const feat1 = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2]);
  const feat2 = createNode(WORK_ITEM_KINDS[1], 32, "test", WORK_ITEM_STATUSES[0]);
  const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[1], [
    feat1,
    feat2,
  ]);

  return { nodes: [cap] };
}

/**
 * Build full 3-level tree
 *
 * Structure:
 * - capability-21_test [DONE]
 *   - feature-21_test [DONE]
 *     - story-21_test [DONE]
 *     - story-32_test [DONE]
 *
 * Used by: text, JSON, markdown, table formatters
 */
export function buildTreeWithStories(): WorkItemTree {
  const story1 = createNode(WORK_ITEM_KINDS[2], 21, "test", WORK_ITEM_STATUSES[2]);
  const story2 = createNode(WORK_ITEM_KINDS[2], 32, "test", WORK_ITEM_STATUSES[2]);
  const feat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [story1, story2]);
  const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[2], [feat]);

  return { nodes: [cap] };
}

/**
 * Build tree with mixed statuses for testing status display
 *
 * Structure:
 * - capability-21_test [IN_PROGRESS]
 *   - feature-21_test [DONE]
 *     - story-21_done [DONE]
 *   - feature-32_test [IN_PROGRESS]
 *     - story-32_progress [IN_PROGRESS]
 *     - story-43_open [OPEN]
 *
 * Used by: text, markdown formatters (status display)
 */
export function buildTreeWithStatus(): WorkItemTree {
  const doneStory = createNode(WORK_ITEM_KINDS[2], 21, "done", WORK_ITEM_STATUSES[2]);
  const doneFeat = createNode(WORK_ITEM_KINDS[1], 21, "test", WORK_ITEM_STATUSES[2], [doneStory]);

  const progressStory = createNode(WORK_ITEM_KINDS[2], 32, "progress", WORK_ITEM_STATUSES[1]);
  const openStory = createNode(WORK_ITEM_KINDS[2], 43, "open", WORK_ITEM_STATUSES[0]);
  const mixedFeat = createNode(WORK_ITEM_KINDS[1], 32, "test", WORK_ITEM_STATUSES[1], [
    progressStory,
    openStory,
  ]);

  const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[1], [
    doneFeat,
    mixedFeat,
  ]);

  return { nodes: [cap] };
}

/**
 * Build tree with mixed statuses for testing summary calculation
 *
 * Structure:
 * - capability-21_test [IN_PROGRESS]
 *   - feature-21_done [DONE]
 *     - story-21_done [DONE]
 *   - feature-32_progress [IN_PROGRESS]
 *     - story-32_progress [IN_PROGRESS]
 *   - feature-43_open [OPEN]
 *     - story-43_open [OPEN]
 *
 * Used by: JSON formatter (summary: { done: 2, inProgress: 2, open: 2 })
 */
export function buildTreeWithMixedStatus(): WorkItemTree {
  const doneStory = createNode(WORK_ITEM_KINDS[2], 21, "done", WORK_ITEM_STATUSES[2]);
  const doneFeat = createNode(WORK_ITEM_KINDS[1], 21, "done", WORK_ITEM_STATUSES[2], [doneStory]);

  const progressStory = createNode(WORK_ITEM_KINDS[2], 32, "progress", WORK_ITEM_STATUSES[1]);
  const progressFeat = createNode(WORK_ITEM_KINDS[1], 32, "progress", WORK_ITEM_STATUSES[1], [
    progressStory,
  ]);

  const openStory = createNode(WORK_ITEM_KINDS[2], 43, "open", WORK_ITEM_STATUSES[0]);
  const openFeat = createNode(WORK_ITEM_KINDS[1], 43, "open", WORK_ITEM_STATUSES[0], [openStory]);

  const cap = createNode(WORK_ITEM_KINDS[0], 20, "test", WORK_ITEM_STATUSES[1], [
    doneFeat,
    progressFeat,
    openFeat,
  ]);

  return { nodes: [cap] };
}

/**
 * Build a path of arbitrary depth based on WORK_ITEM_KINDS
 *
 * Adapts to any hierarchy depth (3 levels, 5 levels, etc.)
 * Returns both the root node and the leaf node for assertions.
 *
 * @param bspNumbers - Array of BSP numbers, one per hierarchy level
 * @param status - Status for the leaf node (default: WORK_ITEM_STATUSES[0])
 * @returns Object with root and leaf nodes
 * @throws Error if bspNumbers length doesn't match WORK_ITEM_KINDS length
 *
 * @example
 * ```typescript
 * // Build path: capability-10 > feature-20 > story-30
 * const { root, leaf } = buildTreePath([10, 20, 30]);
 * expect(leaf.kind).toBe(WORK_ITEM_KINDS[2]);
 * ```
 */
export function buildTreePath(
  bspNumbers: number[],
  status: WorkItemStatus = WORK_ITEM_STATUSES[0],
): { root: TreeNode; leaf: TreeNode } {
  if (bspNumbers.length !== WORK_ITEM_KINDS.length) {
    throw new Error(
      `Expected ${WORK_ITEM_KINDS.length} BSP numbers, got ${bspNumbers.length}`,
    );
  }

  // Build from leaf to root
  let node: TreeNode | null = null;
  for (let i = WORK_ITEM_KINDS.length - 1; i >= 0; i--) {
    const kind = WORK_ITEM_KINDS[i];
    const num = bspNumbers[i];
    // Only leaf gets the specified status, parents are IN_PROGRESS
    const nodeStatus = i === WORK_ITEM_KINDS.length - 1 ? status : WORK_ITEM_STATUSES[1];
    node = createNode(kind, num, `${kind[0]}${num}`, nodeStatus, node ? [node] : []);
  }

  // Find leaf by traversing to deepest node
  let leaf = node!;
  while (leaf.children.length > 0) {
    leaf = leaf.children[0];
  }

  return { root: node!, leaf };
}
