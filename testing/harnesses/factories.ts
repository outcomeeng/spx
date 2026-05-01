/**
 * Factory functions for generating test work items
 */
import type { WorkItem, WorkItemKind } from "@/lib/spec-legacy/types";
import { DEFAULT_BSP_NUMBER, MAX_BSP_NUMBER, MIN_BSP_NUMBER, WORK_ITEM_KINDS } from "./constants";

/**
 * Generate a random BSP number in the valid range [10, 99]
 */
function randomBSPNumber(): number {
  return (
    Math.floor(Math.random() * (MAX_BSP_NUMBER - MIN_BSP_NUMBER + 1))
    + MIN_BSP_NUMBER
  );
}

/**
 * Create a work item directory name from parameters
 *
 * Handles the reverse mapping from internal WorkItem numbers to directory names:
 * - Capabilities: number + 1 (internal 20 → directory "21")
 * - Features/Stories: number as-is (internal 21 → directory "21")
 *
 * @param params - Work item parameters
 * @returns Directory name matching the pattern {kind}-{number}_{slug}
 *
 * @example
 * ```typescript
 * createWorkItemName({ kind: "capability", number: 20, slug: "core-cli" })
 * // Returns: "capability-21_core-cli"
 *
 * createWorkItemName({ kind: "feature", number: 21, slug: "pattern-matching" })
 * // Returns: "feature-21_pattern-matching"
 * ```
 */
export function createWorkItemName(params: {
  kind: WorkItemKind;
  number?: number;
  slug?: string;
}): string {
  const number = params.number ?? DEFAULT_BSP_NUMBER;
  const slug = params.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`;

  // Reverse mapping: capabilities add 1 to get directory number
  const directoryNumber = params.kind === WORK_ITEM_KINDS[0] ? number + 1 : number;

  return `${params.kind}-${directoryNumber}_${slug}`;
}

/**
 * Create a WorkItem object with optional defaults
 *
 * @param params - Partial work item parameters (kind is required)
 * @returns Complete WorkItem object
 *
 * @example
 * ```typescript
 * createWorkItem({ kind: "capability", number: 20, slug: "core-cli" })
 * // Returns: { kind: "capability", number: 20, slug: "core-cli" }
 *
 * createWorkItem({ kind: "feature" })
 * // Returns: { kind: "feature", number: <random>, slug: <random> }
 * ```
 */
export function createWorkItem(
  params: Partial<WorkItem> & { kind: WorkItemKind },
): WorkItem {
  const number = params.number ?? randomBSPNumber();
  const slug = params.slug ?? `test-${Math.random().toString(36).slice(2, 8)}`;
  const name = createWorkItemName({ kind: params.kind, number, slug });
  return {
    kind: params.kind,
    number,
    slug,
    path: params.path ?? `/test/specs/work/doing/${name}`,
  };
}

/**
 * Create a random WorkItem with valid randomized values
 *
 * @param params - Optional partial parameters to override random generation
 * @returns Complete WorkItem with randomized values
 *
 * @example
 * ```typescript
 * createRandomWorkItem()
 * // Returns: { kind: <random>, number: <random>, slug: <random> }
 *
 * createRandomWorkItem({ kind: "story" })
 * // Returns: { kind: "story", number: <random>, slug: <random> }
 * ```
 */
export function createRandomWorkItem(params?: Partial<WorkItem>): WorkItem {
  const kind = params?.kind ?? WORK_ITEM_KINDS[Math.floor(Math.random() * WORK_ITEM_KINDS.length)];

  return createWorkItem({
    kind,
    number: params?.number,
    slug: params?.slug,
    path: params?.path,
  });
}
