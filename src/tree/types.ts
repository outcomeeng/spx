/**
 * Tree structure contract for converting flat work item arrays into formatted output.
 */
import type { WorkItemKind, WorkItemStatus } from "../types";

/**
 * Tree node representing a work item (capability, feature, or story)
 *
 * All work items use the same structure - discriminated by `kind` field.
 * This unified approach simplifies recursive tree operations.
 *
 * @property kind - Type of work item
 * @property number - Internal BSP number (capability: dir-1, others: as-is)
 * @property slug - URL-safe identifier
 * @property path - Full filesystem path
 * @property status - Work item status (computed or rolled up)
 * @property children - Child nodes, sorted by BSP number
 *
 * @example
 * ```typescript
 * const capabilityNode: TreeNode = {
 *   kind: "capability",
 *   number: 20,                    // Directory is capability-21
 *   slug: "core-cli",
 *   path: "/specs/capability-21_core-cli",
 *   status: "IN_PROGRESS",
 *   children: [                    // Features, sorted by BSP number
 *     {
 *       kind: "feature",
 *       number: 21,
 *       slug: "pattern-matching",
 *       status: "DONE",
 *       children: []               // Stories
 *     }
 *   ]
 * };
 * ```
 */
export interface TreeNode {
  kind: WorkItemKind;
  number: number;
  slug: string;
  path: string;
  status: WorkItemStatus;
  children: TreeNode[];
}

/**
 * Root of the work item tree
 *
 * Contains top-level capabilities, each with their feature and story children.
 *
 * @property nodes - Root-level capabilities, sorted by BSP number
 *
 * @example
 * ```typescript
 * const tree: WorkItemTree = {
 *   nodes: [
 *     {
 *       kind: "capability",
 *       number: 20,
 *       slug: "core-cli",
 *       status: "IN_PROGRESS",
 *       children: [...]
 *     }
 *   ]
 * };
 * ```
 */
export interface WorkItemTree {
  nodes: TreeNode[];
}
