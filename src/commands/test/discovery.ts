import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";

const TESTS_DIRECTORY_NAME = SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME;
const SPEC_ROOT_DIRECTORY = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const POSIX_SEPARATOR = "/";
const ERROR_CODE_NOT_FOUND = "ENOENT";

/**
 * Walks the tracked spec tree under `productDir` and returns every file inside a
 * `tests/` directory, as POSIX paths relative to `productDir`, in deterministic
 * ascending order. Partitioning the files by language is a separate, pure concern.
 */
export async function discoverTestFiles(productDir: string): Promise<readonly string[]> {
  const found: string[] = [];
  await collectTestFiles(join(productDir, SPEC_ROOT_DIRECTORY), false, found);
  return found.map((absolute) => toPosixRelative(productDir, absolute)).sort(compareAscii);
}

async function collectTestFiles(directory: string, insideTestsDir: boolean, found: string[]): Promise<void> {
  let entries: readonly Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return;
    throw error;
  }

  for (const entry of entries) {
    const childPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectTestFiles(childPath, insideTestsDir || entry.name === TESTS_DIRECTORY_NAME, found);
    } else if (insideTestsDir && entry.isFile()) {
      found.push(childPath);
    }
  }
}

function toPosixRelative(productDir: string, absolute: string): string {
  return relative(productDir, absolute).split(sep).join(POSIX_SEPARATOR);
}

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === code;
}
