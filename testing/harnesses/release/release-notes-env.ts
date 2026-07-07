import { constants as fsConstants } from "node:fs";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, mkdir, open, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  type ArtifactPromoter,
  type ArtifactReader,
  type ArtifactStage,
  type ArtifactStager,
  type PathCanonicalizer,
  type PathFileDetector,
  type PathSymlinkDetector,
  ReleaseNotesError,
} from "@/domains/release/release-notes";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_DIR_PREFIX = "spx-release-notes-";
const FILE_NOT_FOUND_ERROR_CODE = "ENOENT";
const NOT_DIRECTORY_ERROR_CODE = "ENOTDIR";
const ARTIFACT_TEXT_ENCODING = "utf8";
const ARTIFACT_READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
const ARTIFACT_WRITE_FLAGS = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
const RETARGETED_ARTIFACT_ERROR = "Opened changelog path changed before read-back validation completed";
const RETARGETED_PROMOTION_ERROR = "Changelog promotion target changed before final write";
const STAGING_DIRECTORY_NAME = ".release-notes-stage";
const STAGING_FILE_NAME = "CHANGELOG.md";
export const RELEASE_NOTES_DIRECTORY_SYMLINK_TYPE = "dir";
export const RELEASE_NOTES_FILE_SYMLINK_TYPE = "file";
export const RELEASE_NOTES_OUTSIDE_TEMP_DIR_PREFIX = "spx-release-notes-outside-";

interface ReleaseNotesEnvOptions {
  readonly beforeArtifactRead?: (path: string) => Promise<void>;
}

/** A real temp working tree plus the production-shaped filesystem reader for release-notes composition tests. */
export interface ReleaseNotesEnv {
  /** The product working tree the changelog is resolved and written within. */
  readonly workingDirectory: string;
  /** The injected read-back dependency: a real filesystem reader over the working tree. */
  readonly readArtifact: ArtifactReader;
  /** The injected staging dependency: a real temp path the agent writes before promotion. */
  readonly createArtifactStage: ArtifactStager;
  /** The injected promotion dependency: a real filesystem final-path writer. */
  readonly promoteArtifact: ArtifactPromoter;
  /** The injected canonicalizer: a real filesystem `realpath` boundary over the temp tree. */
  readonly canonicalizePath: PathCanonicalizer;
  /** The injected symlink detector: a real filesystem `lstat` boundary over the temp tree. */
  readonly isSymbolicLink: PathSymlinkDetector;
  /** The injected file detector: a real filesystem `lstat` boundary over the temp tree. */
  readonly isFile: PathFileDetector;
}

/**
 * Provisions a real temp working tree and real filesystem staging, promotion, and
 * artifact-reader boundaries, runs the callback against them, and removes the
 * directory afterward. The read-back is exercised against real files the agent
 * double wrote and the promoter wrote.
 */
export async function withReleaseNotesEnv(
  callback: (env: ReleaseNotesEnv) => Promise<void>,
  options: ReleaseNotesEnvOptions = {},
): Promise<void> {
  await withTempDir(TEMP_DIR_PREFIX, async (workingDirectory) => {
    const canonicalWorkingDirectory = await canonicalizeExistingPath(workingDirectory);
    if (canonicalWorkingDirectory === undefined) {
      throw new ReleaseNotesError(
        `Release-notes working directory cannot be canonicalized: ${workingDirectory}`,
      );
    }
    let stageCounter = 0;
    await callback({
      workingDirectory: canonicalWorkingDirectory,
      readArtifact: (path, expectedCanonicalPath) =>
        readCanonicalArtifactWithoutFollowingFinalSymlink(
          path,
          expectedCanonicalPath,
          options.beforeArtifactRead,
        ),
      createArtifactStage: async (_targetCanonicalPath, existingContent) => {
        stageCounter += 1;
        return await createReleaseNotesArtifactStage(
          canonicalWorkingDirectory,
          stageCounter,
          existingContent,
        );
      },
      promoteArtifact: promoteReleaseNotesArtifact,
      canonicalizePath: canonicalizeExistingPath,
      isSymbolicLink: detectSymbolicLink,
      isFile: detectFile,
    });
  });
}

async function createReleaseNotesArtifactStage(
  workingDirectory: string,
  stageCounter: number,
  existingContent?: string,
): Promise<ArtifactStage> {
  const stageWorkingDirectory = join(
    workingDirectory,
    STAGING_DIRECTORY_NAME,
    String(stageCounter),
  );
  await mkdir(stageWorkingDirectory, { recursive: true });
  const canonicalStageDirectory = await canonicalizeExistingPath(stageWorkingDirectory);
  if (canonicalStageDirectory === undefined) {
    throw new ReleaseNotesError(
      `Release-notes staging directory cannot be canonicalized: ${stageWorkingDirectory}`,
    );
  }
  const stagePath = join(canonicalStageDirectory, STAGING_FILE_NAME);
  if (existingContent !== undefined) {
    await writeFile(stagePath, existingContent);
  }
  return {
    workingDirectory: canonicalStageDirectory,
    path: stagePath,
  };
}

async function promoteReleaseNotesArtifact(
  _stagedCanonicalPath: string,
  targetCanonicalPath: string,
  content: string,
): Promise<void> {
  const targetDirectory = dirname(targetCanonicalPath);
  await mkdir(targetDirectory, { recursive: true });
  const canonicalTargetDirectory = await canonicalizeExistingPath(targetDirectory);
  if (canonicalTargetDirectory !== targetDirectory) {
    throw new ReleaseNotesError(
      `${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`,
    );
  }
  const handle = await openPromotedArtifact(targetCanonicalPath);
  try {
    await handle.writeFile(content, { encoding: ARTIFACT_TEXT_ENCODING });
  } finally {
    await handle.close();
  }
  const promotedCanonicalPath = await canonicalizeExistingPath(targetCanonicalPath);
  if (promotedCanonicalPath !== targetCanonicalPath) {
    throw new ReleaseNotesError(
      `${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`,
    );
  }
}

async function openPromotedArtifact(targetCanonicalPath: string): Promise<FileHandle> {
  try {
    return await open(targetCanonicalPath, ARTIFACT_WRITE_FLAGS);
  } catch {
    throw new ReleaseNotesError(
      `${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`,
    );
  }
}

async function readCanonicalArtifactWithoutFollowingFinalSymlink(
  path: string,
  expectedCanonicalPath?: string,
  beforeArtifactRead?: (path: string) => Promise<void>,
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
    await beforeArtifactRead?.(canonicalPath);
    const content = await handle.readFile({ encoding: ARTIFACT_TEXT_ENCODING });
    const postReadCanonicalPath = await canonicalizeExistingPath(path);
    if (postReadCanonicalPath !== canonicalPath) {
      throw new ReleaseNotesError(
        `${RETARGETED_ARTIFACT_ERROR}: ${path}`,
      );
    }
    const postReadArtifact = await stat(canonicalPath);
    if (!isSameArtifact(openedArtifact, postReadArtifact)) {
      throw new ReleaseNotesError(
        `${RETARGETED_ARTIFACT_ERROR}: ${path}`,
      );
    }
    return content;
  } finally {
    await handle.close();
  }
}

function isSameArtifact(openedArtifact: Stats, currentArtifact: Stats): boolean {
  return openedArtifact.dev === currentArtifact.dev
    && openedArtifact.ino === currentArtifact.ino
    && openedArtifact.size === currentArtifact.size
    && openedArtifact.mtimeMs === currentArtifact.mtimeMs
    && openedArtifact.ctimeMs === currentArtifact.ctimeMs;
}

async function canonicalizeExistingPath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch (error) {
    if (isMissingPathError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function detectSymbolicLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

async function detectFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && (error.code === FILE_NOT_FOUND_ERROR_CODE || error.code === NOT_DIRECTORY_ERROR_CODE);
}
