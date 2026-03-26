/**
 * Text formatter for work item trees
 *
 * Renders hierarchical tree with indentation and colored status indicators.
 * Output format:
 *   capability-21_name [STATUS] (colored)
 *     feature-32_name [STATUS] (colored)
 *       story-21_name [STATUS] (colored)
 */
import chalk from "chalk";
import type { TreeNode, WorkItemTree } from "../tree/types.js";
import type { WorkItemKind } from "../types.js";

/**
 * Format work item tree as text with hierarchical indentation
 *
 * @param tree - Work item tree to format
 * @returns Formatted text output with indentation and status
 *
 * @example
 * ```typescript
 * const tree = buildTreeWithStories();
 * const output = formatText(tree);
 * // => "capability-21_test [DONE]\n  feature-21_test [DONE]\n    story-21_test [DONE]"
 * ```
 */
export function formatText(tree: WorkItemTree): string {
  const lines: string[] = [];

  for (const node of tree.nodes) {
    lines.push(formatNode(node, 0));
  }

  return lines.join("\n");
}

/**
 * Format a single tree node with indentation and colored status
 *
 * @param node - Tree node to format
 * @param indent - Indentation level (0 = no indent, 2 = feature, 4 = story)
 * @returns Formatted node and all children
 */
function formatNode(node: TreeNode, indent: number): string {
  const lines: string[] = [];

  // Format current node
  const name = formatWorkItemName(node.kind, node.number, node.slug);
  const prefix = " ".repeat(indent);
  const status = formatStatus(node.status);
  const line = `${prefix}${name} ${status}`;
  lines.push(line);

  // Recursively format children with increased indentation
  for (const child of node.children) {
    lines.push(formatNode(child, indent + 2));
  }

  return lines.join("\n");
}

/**
 * Format work item name for display
 *
 * Converts internal number to display number for capabilities.
 *
 * @param kind - Work item type
 * @param number - Internal BSP number
 * @param slug - URL-safe identifier
 * @returns Formatted name (e.g., "capability-21_core-cli")
 */
function formatWorkItemName(
  kind: WorkItemKind,
  number: number,
  slug: string,
): string {
  // Capabilities: display = internal + 1
  // Features/Stories: display = internal
  const displayNumber = kind === "capability" ? number + 1 : number;
  return `${kind}-${displayNumber}_${slug}`;
}

/**
 * Format status with color
 *
 * Colors:
 * - DONE: green
 * - IN_PROGRESS: yellow
 * - OPEN: gray
 *
 * @param status - Work item status
 * @returns Colored status string with brackets
 */
function formatStatus(status: string): string {
  switch (status) {
    case "DONE":
      return chalk.green(`[${status}]`);
    case "IN_PROGRESS":
      return chalk.yellow(`[${status}]`);
    case "OPEN":
      return chalk.gray(`[${status}]`);
    default:
      return `[${status}]`;
  }
}
