import { constants as fsConstants } from "node:fs";
import type { Stats } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";

import {
  type ArtifactReader,
  type PathCanonicalizer,
  type PathSymlinkDetector,
  ReleaseNotesError,
} from "@/domains/release/release-notes";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-release-notes-";
const FILE_NOT_FOUND_ERROR_CODE = "ENOENT";
const ARTIFACT_TEXT_ENCODING = "utf8";
const ARTIFACT_READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
const RETARGETED_ARTIFACT_ERROR = "Opened changelog path changed before read-back validation completed";
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
      readArtifact: readCanonicalArtifactWithoutFollowingFinalSymlink,
      canonicalizePath: canonicalizeExistingPath,
      isSymbolicLink: detectSymbolicLink,
    });
  });
}

async function readCanonicalArtifactWithoutFollowingFinalSymlink(
  path: string,
  expectedCanonicalPath?: string,
): Promise<string> {
  const canonicalPath = expectedCanonicalPath ?? await canonicalizeExistingPath(path);
  if (canonicalPath === undefined) {
    throw new ReleaseNotesError(
      `${RETARGETED_ARTIFACT_ERROR}: ${path}`,
    );
  }
  const handle = await open(canonicalPath, ARTIFACT_READ_FLAGS);
  try {
    const openedArtifact = await handle.stat();
    const currentCanonicalPath = await canonicalizeExistingPath(path);
    if (currentCanonicalPath !== canonicalPath) {
      throw new ReleaseNotesError(
        `${RETARGETED_ARTIFACT_ERROR}: ${path}`,
      );
    }
    const currentArtifact = await stat(canonicalPath);
    if (!isSameArtifact(openedArtifact, currentArtifact)) {
      throw new ReleaseNotesError(
        `${RETARGETED_ARTIFACT_ERROR}: ${path}`,
      );
    }
    return await handle.readFile({ encoding: ARTIFACT_TEXT_ENCODING });
  } finally {
    await handle.close();
  }
}

function isSameArtifact(openedArtifact: Stats, currentArtifact: Stats): boolean {
  return openedArtifact.dev === currentArtifact.dev && openedArtifact.ino === currentArtifact.ino;
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
