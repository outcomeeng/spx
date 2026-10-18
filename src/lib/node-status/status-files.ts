import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";

import { NODE_STATUS_FILENAME } from "./read";

export function nodeStatusPath(productDir: string, nodeId: string): string {
  return join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY, nodeId, NODE_STATUS_FILENAME);
}

export async function collectNodeStatusFiles(directory: string): Promise<readonly string[]> {
  const entries = await readDirectoryEntries(directory);

  const statusPaths: string[] = [];
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      statusPaths.push(...await collectNodeStatusFiles(entryPath));
    } else if (entry.isFile() && entry.name === NODE_STATUS_FILENAME) {
      statusPaths.push(entryPath);
    }
  }
  return statusPaths;
}

async function readDirectoryEntries(directory: string): Promise<readonly Dirent<string>[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
