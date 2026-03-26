/**
 * Pattern matching for work item directory names
 */
import type { WorkItem, WorkItemKind } from "../types.js";
import { validateBSPNumber } from "./validation.js";

/**
 * Regex pattern for work item directory names
 * Format: {kind}-{number}_{slug}
 * - kind: capability, feature, or story
 * - number: BSP number (10-99)
 * - slug: kebab-case identifier (lowercase, hyphens only)
 */
const WORK_ITEM_PATTERN = /^(capability|feature|story)-(\d+)_([a-z][a-z0-9-]*)$/;

/**
 * Parse a work item directory name into structured data
 *
 * @param dirName - Directory name to parse
 * @returns Parsed work item with kind, number, and slug (path not included)
 * @throws Error if the directory name doesn't match the pattern or BSP number is invalid
 *
 * @example
 * ```typescript
 * parseWorkItemName("capability-21_core-cli")
 * // Returns: { kind: "capability", number: 20, slug: "core-cli" }
 *
 * parseWorkItemName("feature-21_pattern-matching")
 * // Returns: { kind: "feature", number: 21, slug: "pattern-matching" }
 * ```
 */
export function parseWorkItemName(dirName: string): Omit<WorkItem, "path"> {
  const match = WORK_ITEM_PATTERN.exec(dirName);

  if (!match) {
    throw new Error(
      `Invalid work item name: "${dirName}". Expected format: {kind}-{number}_{slug} `
        + `(e.g., "capability-21_core-cli", "feature-21_pattern-matching")`,
    );
  }

  const kind = match[1] as WorkItemKind;
  const bspNumber = parseInt(match[2], 10);
  const slug = match[3];

  // Validate BSP number range using validation module
  validateBSPNumber(bspNumber);

  // Capabilities use 0-indexed numbers (directory number - 1)
  // Features and stories use directory number as-is
  const number = kind === "capability" ? bspNumber - 1 : bspNumber;

  return {
    kind,
    number,
    slug,
  };
}
