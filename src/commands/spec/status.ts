/**
 * Status command implementation
 *
 * Orchestrates all features to display project status:
 * 1. Scanner (Feature 32) - Walk specs directory
 * 2. Status (Feature 43) - Determine status for each work item
 * 3. Tree Building (Feature 54) - Build hierarchical tree
 * 4. Output Formatting (Feature 65) - Format in specified format
 */
import { DEFAULT_CONFIG } from "../../config/defaults.js";
import { formatJSON } from "../../reporter/json.js";
import { formatMarkdown } from "../../reporter/markdown.js";
import { formatTable } from "../../reporter/table.js";
import { formatText } from "../../reporter/text.js";
import { Scanner } from "../../scanner/scanner.js";
import { buildTree } from "../../tree/build.js";

/**
 * Supported output formats
 */
export type OutputFormat = "text" | "json" | "markdown" | "table";

/**
 * Options for status command
 */
export interface StatusOptions {
  /** Working directory (defaults to current directory) */
  cwd?: string;
  /** Output format (defaults to text) */
  format?: OutputFormat;
}

/**
 * Execute status command
 *
 * Displays current project status by:
 * - Walking specs/doing directory to find work items
 * - Determining status for each work item
 * - Building hierarchical tree structure
 * - Formatting and outputting in specified format
 *
 * @param options - Command options
 * @returns Formatted status output
 *
 * @example
 * ```typescript
 * const output = await statusCommand({ cwd: "/path/to/project", format: "json" });
 * console.log(output);
 * ```
 */
export async function statusCommand(
  options: StatusOptions = {},
): Promise<string> {
  const cwd = options.cwd || process.cwd();
  const format = options.format || "text";

  // Step 1-3: Use Scanner with config-driven paths
  const scanner = new Scanner(cwd, DEFAULT_CONFIG);
  let workItems;
  try {
    workItems = await scanner.scan();
  } catch (error) {
    // Handle missing directory gracefully
    if (error instanceof Error && error.message.includes("ENOENT")) {
      const doingPath =
        `${DEFAULT_CONFIG.specs.root}/${DEFAULT_CONFIG.specs.work.dir}/${DEFAULT_CONFIG.specs.work.statusDirs.doing}`;
      throw new Error(
        `Directory ${doingPath} not found.\n\nThis command is for legacy specs/ projects. For CODE framework projects, check the spx/ directory for specifications.`,
      );
    }
    throw error;
  }

  // Handle empty project
  if (workItems.length === 0) {
    return `No work items found in ${DEFAULT_CONFIG.specs.root}/${DEFAULT_CONFIG.specs.work.dir}/${DEFAULT_CONFIG.specs.work.statusDirs.doing}`;
  }

  // Step 4: Build hierarchical tree with status
  const tree = await buildTree(workItems);

  // Step 5: Format based on requested format
  switch (format) {
    case "json":
      return formatJSON(tree, DEFAULT_CONFIG);
    case "markdown":
      return formatMarkdown(tree);
    case "table":
      return formatTable(tree);
    case "text":
    default:
      return formatText(tree);
  }
}
