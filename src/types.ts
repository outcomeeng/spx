/**
 * Core type definitions for spx
 */

/**
 * Work item types in the spec hierarchy
 */
export const WORK_ITEM_KIND = {
  CAPABILITY: "capability",
  FEATURE: "feature",
  STORY: "story",
} as const;

export type WorkItemKind = (typeof WORK_ITEM_KIND)[keyof typeof WORK_ITEM_KIND];

/**
 * Ordered hierarchy of work item kinds (root to leaf)
 *
 * Used by both production code and tests to derive hierarchy structure.
 * Derive work item kind names from this constant.
 */
export const WORK_ITEM_KINDS: readonly WorkItemKind[] = [
  WORK_ITEM_KIND.CAPABILITY,
  WORK_ITEM_KIND.FEATURE,
  WORK_ITEM_KIND.STORY,
] as const;

/**
 * The leaf kind (actionable work items)
 *
 * Derived from WORK_ITEM_KINDS to ensure consistency if hierarchy changes.
 */
export const LEAF_KIND: WorkItemKind = WORK_ITEM_KINDS.at(-1)!;

/**
 * Parsed work item structure
 */
export interface WorkItem {
  /** The type of work item */
  kind: WorkItemKind;
  /** BSP number (0-indexed for capabilities, as-is for features/stories) */
  number: number;
  /** URL-safe slug identifier */
  slug: string;
  /** Full filesystem path to work item directory */
  path: string;
}

/**
 * Directory entry from filesystem traversal
 */
export interface DirectoryEntry {
  /** Directory name (basename) */
  name: string;
  /** Full absolute path */
  path: string;
  /** Whether this is a directory */
  isDirectory: boolean;
}

/**
 * Work item status
 */
export const WORK_ITEM_STATUS = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
} as const;

export type WorkItemStatus = (typeof WORK_ITEM_STATUS)[keyof typeof WORK_ITEM_STATUS];

/**
 * Ordered list of work item statuses
 *
 * Used by both production code and tests to derive status values.
 * Derive work item status names from this constant.
 */
export const WORK_ITEM_STATUSES: readonly WorkItemStatus[] = [
  WORK_ITEM_STATUS.OPEN,
  WORK_ITEM_STATUS.IN_PROGRESS,
  WORK_ITEM_STATUS.DONE,
] as const;
