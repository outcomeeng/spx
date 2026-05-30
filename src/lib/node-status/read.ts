import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SPEC_TREE_NODE_STATE, type SpecTreeNodeState } from "@/lib/spec-tree/config";
import { NODE_STATUS_STATUS_KEY } from "./classify";

/** Filename of the co-located per-node lifecycle-state record. */
export const NODE_STATUS_FILENAME = "spx.status.json";

const NODE_STATUS_VALUES: ReadonlySet<string> = new Set(Object.values(SPEC_TREE_NODE_STATE));

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isSpecTreeNodeState(value: unknown): value is SpecTreeNodeState {
  return typeof value === "string" && NODE_STATUS_VALUES.has(value);
}

/**
 * Read a node's recorded lifecycle state from its co-located `spx.status.json`.
 *
 * Returns `undefined` when the file is absent — absence means "no recorded
 * state", which routes consumers to live derivation. A present file whose
 * content is not a valid status record is a corruption error, not absence.
 *
 * @param nodeDir - Absolute path to the node directory.
 */
export function readNodeStatus(nodeDir: string): SpecTreeNodeState | undefined {
  const filePath = join(nodeDir, NODE_STATUS_FILENAME);

  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;
  const status = parsed[NODE_STATUS_STATUS_KEY];
  if (!isSpecTreeNodeState(status)) {
    throw new Error(
      `Invalid ${NODE_STATUS_FILENAME} at ${filePath}: status "${String(status)}" is not a lifecycle state`,
    );
  }
  return status;
}
