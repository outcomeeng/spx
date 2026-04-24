import { DEFAULT_CONFIG } from "@/config/defaults.js";
import { Scanner } from "@/scanner/scanner.js";
import { buildTree } from "@/tree/build.js";
import type { TreeNode, WorkItemTree } from "@/tree/types.js";
import { LEAF_KIND } from "@/types.js";

const EMPTY_WORK_ITEMS_MESSAGE = "No work items found in specs/work/doing";
const ALL_COMPLETE_MESSAGE = "All work items are complete! 🎉";
const NEXT_WORK_ITEM_HEADING = "Next work item:";
const STATUS_LABEL = "Status";
const PATH_LABEL = "Path";
const INDENT = "  ";
const BLANK_LINE = "";
const PATH_SEPARATOR = " > ";

export interface NextOptions {
  cwd?: string;
}

export function findNextWorkItem(tree: WorkItemTree): TreeNode | null {
  return findFirstNonDoneLeaf(tree.nodes);
}

function findFirstNonDoneLeaf(nodes: TreeNode[]): TreeNode | null {
  for (const node of nodes) {
    if (node.kind === LEAF_KIND) {
      if (node.status !== "DONE") {
        return node;
      }

      continue;
    }

    const found = findFirstNonDoneLeaf(node.children);
    if (found !== null) {
      return found;
    }
  }

  return null;
}

function formatWorkItemName(node: TreeNode): string {
  const displayNumber = node.kind === "capability" ? node.number + 1 : node.number;
  return `${node.kind}-${displayNumber}_${node.slug}`;
}

function findParents(
  nodes: TreeNode[],
  target: TreeNode,
): { capability?: TreeNode; feature?: TreeNode } {
  for (const capability of nodes) {
    for (const feature of capability.children) {
      for (const story of feature.children) {
        if (story.path === target.path) {
          return { capability, feature };
        }
      }
    }
  }

  return {};
}

export async function nextCommand(options: NextOptions = {}): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const scanner = new Scanner(cwd, DEFAULT_CONFIG);
  const workItems = await scanner.scan();

  if (workItems.length === 0) {
    return EMPTY_WORK_ITEMS_MESSAGE;
  }

  const tree = await buildTree(workItems);
  const next = findNextWorkItem(tree);

  if (next === null) {
    return ALL_COMPLETE_MESSAGE;
  }

  const parents = findParents(tree.nodes, next);
  const pathLine = parents.capability !== undefined && parents.feature !== undefined
    ? `${INDENT}${formatWorkItemName(parents.capability)}${PATH_SEPARATOR}${
      formatWorkItemName(parents.feature)
    }${PATH_SEPARATOR}${formatWorkItemName(next)}`
    : `${INDENT}${formatWorkItemName(next)}`;

  return [
    NEXT_WORK_ITEM_HEADING,
    BLANK_LINE,
    pathLine,
    BLANK_LINE,
    `${INDENT}${STATUS_LABEL}: ${next.status}`,
    `${INDENT}${PATH_LABEL}: ${next.path}`,
  ].join("\n");
}
