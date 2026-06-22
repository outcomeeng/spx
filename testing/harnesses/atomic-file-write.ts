/**
 * Recording in-memory filesystem for atomic-file-write tests. Implements the
 * {@link AtomicWriteFileSystem} boundary and captures the operations the
 * primitive performs — the final file contents plus the ordered written,
 * renamed, and removed paths — so a test reads exactly the observability its
 * assertion needs without re-deriving the boundary.
 *
 * @module testing/harnesses/atomic-file-write
 */

import type { AtomicWriteFileSystem } from "@/lib/atomic-file-write";

export interface RecordingAtomicWriteFs extends AtomicWriteFileSystem {
  readonly files: Map<string, string>;
  readonly written: string[];
  readonly renamed: Array<{ from: string; to: string }>;
  readonly removed: string[];
}

export function createRecordingAtomicWriteFs(): RecordingAtomicWriteFs {
  const files = new Map<string, string>();
  const written: string[] = [];
  const renamed: Array<{ from: string; to: string }> = [];
  const removed: string[] = [];
  return {
    files,
    written,
    renamed,
    removed,
    async writeFile(path, data) {
      written.push(path);
      files.set(path, data);
    },
    async rename(from, to) {
      renamed.push({ from, to });
      const data = files.get(from);
      if (data === undefined) {
        throw new Error(`rename ENOENT: no such file '${from}'`);
      }
      files.set(to, data);
      files.delete(from);
    },
    async rm(path) {
      removed.push(path);
      files.delete(path);
    },
  };
}
