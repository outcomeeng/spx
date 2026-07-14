import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";

export const NODE_STATUS_EXCLUDE_FILENAME = "EXCLUDE";
export const NODE_STATUS_EXCLUDE_PATH_GRAMMAR = {
  SEGMENT_SEPARATOR: "/",
  CURRENT_DIRECTORY_SEGMENT: ".",
  PARENT_DIRECTORY_SEGMENT: "..",
} as const;

type NodeStatusExclusionEntry = {
  readonly id?: string;
  readonly ref?: {
    readonly path?: string;
  };
};

export type NodeStatusExcludeReader = {
  isExcluded(node: NodeStatusExclusionEntry): boolean;
  entries(): readonly string[];
};

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}

function excludePath(productDir: string): string {
  return join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, NODE_STATUS_EXCLUDE_FILENAME);
}

function parseExcludeEntries(content: string): readonly string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(validateExcludeEntry);
}

function validateExcludeEntry(entry: string): string {
  const segments = entry.split(NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR);
  if (
    entry.startsWith(NODE_STATUS_EXCLUDE_PATH_GRAMMAR.SEGMENT_SEPARATOR)
    || segments.some((segment) =>
      segment.length === 0
      || segment === NODE_STATUS_EXCLUDE_PATH_GRAMMAR.CURRENT_DIRECTORY_SEGMENT
      || segment === NODE_STATUS_EXCLUDE_PATH_GRAMMAR.PARENT_DIRECTORY_SEGMENT
    )
  ) {
    throw new Error(nodeStatusInvalidExcludeEntryMessage(entry));
  }
  return entry;
}

export function nodeStatusInvalidExcludeEntryMessage(entry: string): string {
  return `Invalid ${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${NODE_STATUS_EXCLUDE_FILENAME} entry: ${entry}`;
}

export function createNodeStatusExcludeReader(productDir: string): NodeStatusExcludeReader {
  let content: string;
  try {
    content = readFileSync(excludePath(productDir), "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      content = "";
    } else {
      throw err;
    }
  }
  const entries = parseExcludeEntries(content);
  const entrySet = new Set(entries);
  return {
    isExcluded(node: NodeStatusExclusionEntry): boolean {
      return isNodeStatusEntryExcluded(entrySet, node);
    },
    entries(): readonly string[] {
      return entries;
    },
  };
}

export function isNodeStatusEntryExcluded(
  excludeEntries: ReadonlySet<string>,
  node: NodeStatusExclusionEntry,
): boolean {
  const nodeId = node.id;
  if (nodeId !== undefined && excludeEntries.has(nodeId)) return true;
  const reference = node.ref?.path;
  if (reference === undefined) return false;
  const prefix = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;
  const relativeReference = reference.startsWith(prefix) ? reference.slice(prefix.length) : reference;
  return excludeEntries.has(relativeReference);
}
