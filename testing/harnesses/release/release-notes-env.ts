import { readFile } from "node:fs/promises";

import type { ArtifactReader } from "@/domains/release/release-notes";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-release-notes-";

/** A real temp working tree plus the production-shaped filesystem reader for release-notes composition tests. */
export interface ReleaseNotesEnv {
  /** The product working tree the changelog is resolved and written within. */
  readonly workingDirectory: string;
  /** The injected read-back dependency: a real filesystem reader over the working tree. */
  readonly readArtifact: ArtifactReader;
}

/**
 * Provisions a real temp working tree and a real filesystem artifact reader, runs
 * the callback against them, and removes the directory afterward. The reader is the
 * production-shaped dependency the composition reads its written notes back through,
 * so the read-back is exercised against a real file the agent double wrote.
 */
export async function withReleaseNotesEnv(callback: (env: ReleaseNotesEnv) => Promise<void>): Promise<void> {
  await withTempDir(TEMP_DIR_PREFIX, async (workingDirectory) => {
    await callback({ workingDirectory, readArtifact: (path) => readFile(path, "utf8") });
  });
}
