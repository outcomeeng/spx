/**
 * JSON formatter for work item trees
 *
 * Produces structured JSON with summary statistics and full tree data.
 */
import type { SpxConfig } from "@/config/defaults";
import { TreeNode, WorkItemTree } from "../tree/types";

/** JSON indentation width. */
const JSON_INDENT = 2;

/**
 * Summary counts for capabilities and features only (NOT stories)
 */
interface Summary {
  done: number;
  inProgress: number;
  open: number;
}

/**
 * JSON output structure
 */
interface JSONOutput {
  config: {
    specs: SpxConfig["specs"];
    sessions: SpxConfig["sessions"];
  };
  summary: Summary;
  capabilities: unknown[];
}

/**
 * Format tree as JSON with summary statistics
 *
 * Summary counts capabilities + features only (per user requirement).
 * Display numbers:
 * - Capabilities: internal + 1
 * - Features/Stories: as-is
 *
 * @param tree - Work item tree to format
 * @param config - SpxConfig used for path resolution
 * @returns JSON string with 2-space indentation
 */
export function formatJSON(tree: WorkItemTree, config: SpxConfig): string {
  const capabilities = tree.nodes.map((node) => nodeToJSON(node));
  const summary = calculateSummary(tree);

  const output: JSONOutput = {
    config: {
      specs: config.specs,
      sessions: config.sessions,
    },
    summary,
    capabilities,
  };

  return JSON.stringify(output, null, JSON_INDENT);
}

/**
 * Convert tree node to JSON structure with display numbers
 *
 * @param node - Tree node to convert
 * @returns JSON-serializable object
 */
function nodeToJSON(node: TreeNode): unknown {
  const displayNumber = getDisplayNumber(node);

  const base = {
    kind: node.kind,
    number: displayNumber,
    slug: node.slug,
    status: node.status,
  };

  // Add children based on kind
  if (node.kind === "capability") {
    return {
      ...base,
      features: node.children.map((child) => nodeToJSON(child)),
    };
  } else if (node.kind === "feature") {
    return {
      ...base,
      stories: node.children.map((child) => nodeToJSON(child)),
    };
  } else {
    // Stories have no children
    return base;
  }
}

/**
 * Calculate summary statistics
 *
 * Counts capabilities + features only (NOT stories per user requirement)
 *
 * @param tree - Work item tree
 * @returns Summary counts
 */
function calculateSummary(tree: WorkItemTree): Summary {
  const summary: Summary = {
    done: 0,
    inProgress: 0,
    open: 0,
  };

  for (const capability of tree.nodes) {
    // Count capability
    countNode(capability, summary);

    // Count features (but NOT stories)
    for (const feature of capability.children) {
      countNode(feature, summary);
    }
  }

  return summary;
}

/**
 * Count a single node in summary
 *
 * @param node - Node to count
 * @param summary - Summary object to update
 */
function countNode(node: TreeNode, summary: Summary): void {
  switch (node.status) {
    case "DONE":
      summary.done++;
      break;
    case "IN_PROGRESS":
      summary.inProgress++;
      break;
    case "OPEN":
      summary.open++;
      break;
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
