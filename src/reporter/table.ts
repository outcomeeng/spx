/**
 * Table formatter for work item trees
 *
 * Renders trees as aligned tables with dynamic column widths.
 */
import type { TreeNode, WorkItemTree } from "../tree/types";

/**
 * Table row data
 */
interface TableRow {
  level: string;
  number: string;
  name: string;
  status: string;
}

/**
 * Format tree as aligned table with dynamic column widths
 *
 * Columns: Level | Number | Name | Status
 * Level shows indented hierarchy:
 * - "Capability" (no indent)
 * - "  Feature" (2-space indent)
 * - "    Story" (4-space indent)
 *
 * Display numbers:
 * - Capabilities: internal + 1
 * - Features/Stories: as-is
 *
 * @param tree - Work item tree to format
 * @returns Formatted table with aligned columns
 */
export function formatTable(tree: WorkItemTree): string {
  const rows: TableRow[] = [];

  // Collect all rows
  for (const node of tree.nodes) {
    collectRows(node, 0, rows);
  }

  // Calculate column widths
  const widths = calculateColumnWidths(rows);

  // Format table
  const lines: string[] = [];

  // Header row
  lines.push(
    formatRow(
      {
        level: "Level",
        number: "Number",
        name: "Name",
        status: "Status",
      },
      widths,
    ),
  );

  // Separator row
  lines.push(
    `|${"-".repeat(widths.level + 2)}|${"-".repeat(widths.number + 2)}|${"-".repeat(widths.name + 2)}|${
      "-".repeat(widths.status + 2)
    }|`,
  );

  // Data rows
  for (const row of rows) {
    lines.push(formatRow(row, widths));
  }

  return lines.join("\n");
}

/**
 * Recursively collect table rows from tree
 *
 * @param node - Current node
 * @param depth - Current depth (0 = capability, 1 = feature, 2 = story)
 * @param rows - Output rows array
 */
function collectRows(node: TreeNode, depth: number, rows: TableRow[]): void {
  const indent = "  ".repeat(depth);
  const levelName = getLevelName(node.kind);
  const displayNumber = getDisplayNumber(node);

  rows.push({
    level: `${indent}${levelName}`,
    number: String(displayNumber),
    name: node.slug,
    status: node.status,
  });

  // Recurse for children
  for (const child of node.children) {
    collectRows(child, depth + 1, rows);
  }
}

/**
 * Get level name with proper capitalization
 *
 * @param kind - Work item kind
 * @returns Capitalized level name
 */
function getLevelName(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
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

/**
 * Calculate maximum width for each column
 *
 * @param rows - All table rows including header
 * @returns Column widths
 */
function calculateColumnWidths(rows: TableRow[]): {
  level: number;
  number: number;
  name: number;
  status: number;
} {
  const widths = {
    level: "Level".length,
    number: "Number".length,
    name: "Name".length,
    status: "Status".length,
  };

  for (const row of rows) {
    widths.level = Math.max(widths.level, row.level.length);
    widths.number = Math.max(widths.number, row.number.length);
    widths.name = Math.max(widths.name, row.name.length);
    widths.status = Math.max(widths.status, row.status.length);
  }

  return widths;
}

/**
 * Format a single table row with proper padding
 *
 * @param row - Row data
 * @param widths - Column widths
 * @returns Formatted row with | delimiters
 */
function formatRow(
  row: TableRow,
  widths: { level: number; number: number; name: number; status: number },
): string {
  return `| ${row.level.padEnd(widths.level)} | ${row.number.padEnd(widths.number)} | ${
    row.name.padEnd(widths.name)
  } | ${row.status.padEnd(widths.status)} |`;
}
