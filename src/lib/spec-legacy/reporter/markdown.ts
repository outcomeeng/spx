/**
 * Markdown formatter for work item trees
 *
 * Renders trees with heading hierarchy and status lines.
 */
import type { TreeNode, WorkItemTree } from "../tree/types";

/**
 * Format tree as markdown with heading hierarchy
 *
 * Heading levels:
 * - Capabilities: #
 * - Features: ##
 * - Stories: ###
 *
 * Display numbers:
 * - Capabilities: internal + 1
 * - Features/Stories: as-is
 *
 * @param tree - Work item tree to format
 * @returns Formatted markdown
 *
 * @example
 * ```typescript
 * const tree = buildTreeWithStories();
 * const output = formatMarkdown(tree);
 * // => "# capability-21_test\n\nStatus: DONE\n\n## feature-21_test\n..."
 * ```
 */
export function formatMarkdown(tree: WorkItemTree): string {
  const sections: string[] = [];

  for (const node of tree.nodes) {
    formatNode(node, 1, sections);
  }

  return sections.join("\n\n");
}

/**
 * Recursively format a tree node as markdown
 *
 * @param node - Current node to format
 * @param level - Heading level (1 = #, 2 = ##, 3 = ###)
 * @param sections - Output sections array
 */
function formatNode(
  node: TreeNode,
  level: number,
  sections: string[],
): void {
  const displayNumber = getDisplayNumber(node);
  const name = `${node.kind}-${displayNumber}_${node.slug}`;
  const heading = "#".repeat(level);

  sections.push(`${heading} ${name}`);
  sections.push(`Status: ${node.status}`);

  // Recurse for children
  for (const child of node.children) {
    formatNode(child, level + 1, sections);
  }
}

/**
 * Get display number for a work item
 *
 * Display numbers:
 * - Capabilities: internal + 1 (dir capability-21 has internal 20)
 * - Features/Stories: as-is
 */
function getDisplayNumber(node: TreeNode): number {
  return node.kind === "capability" ? node.number + 1 : node.number;
}
