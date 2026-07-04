import { lstat, readFile, realpath } from "node:fs/promises";

import type { ArtifactReader, PathCanonicalizer, PathSymlinkDetector } from "@/domains/release/release-notes";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-release-notes-";
const FILE_NOT_FOUND_ERROR_CODE = "ENOENT";
export const RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE = "dir";
export const RELEASE_NOTES_FILE_SYMLINK_TYPE = "file";
export const RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX = "spx-release-notes-outside-";

/** A real temp working tree plus the production-shaped filesystem reader for release-notes composition tests. */
export interface ReleaseNotesEnv {
  /** The product working tree the changelog is resolved and written within. */
  readonly workingDirectory: string;
  /** The injected read-back dependency: a real filesystem reader over the working tree. */
  readonly readArtifact: ArtifactReader;
  /** The injected canonicalizer: a real filesystem `realpath` boundary over the temp tree. */
  readonly canonicalizePath: PathCanonicalizer;
  /** The injected symlink detector: a real filesystem `lstat` boundary over the temp tree. */
  readonly isSymbolicLink: PathSymlinkDetector;
}

/**
 * Provisions a real temp working tree and a real filesystem artifact reader, runs
 * the callback against them, and removes the directory afterward. The reader is the
 * production-shaped dependency the composition reads its written notes back through,
 * so the read-back is exercised against a real file the agent double wrote.
 */
export async function withReleaseNotesEnv(callback: (env: ReleaseNotesEnv) => Promise<void>): Promise<void> {
  await withTempDir(TEMP_DIR_PREFIX, async (workingDirectory) => {
    await callback({
      workingDirectory,
      readArtifact: (path) => readFile(path, "utf8"),
      canonicalizePath: canonicalizeExistingPath,
      isSymbolicLink: detectSymbolicLink,
    });
  });
}

async function canonicalizeExistingPath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === FILE_NOT_FOUND_ERROR_CODE) {
      return undefined;
    }
    throw error;
  }
}

async function detectSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === FILE_NOT_FOUND_ERROR_CODE) {
      return false;
    }
    throw error;
  }
}
