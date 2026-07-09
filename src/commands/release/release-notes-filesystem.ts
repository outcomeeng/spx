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

const FILE_NOT_FOUND_ERROR_CODE = "ENOENT";
const NOT_DIRECTORY_ERROR_CODE = "ENOTDIR";
const ARTIFACT_TEXT_ENCODING = "utf8";
const ARTIFACT_READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;
const ARTIFACT_WRITE_FLAGS = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW;
const RETARGETED_ARTIFACT_ERROR = "Opened changelog path changed before read-back validation completed";
const RETARGETED_PROMOTION_ERROR = "Changelog promotion target changed before final write";
const STAGING_DIRECTORY_NAME = ".release-notes-stage";
const STAGING_FILE_NAME = "CHANGELOG.md";

export interface ReleaseNotesFilesystem {
  readonly readArtifact: ArtifactReader;
  readonly createArtifactStage: ArtifactStager;
  readonly promoteArtifact: ArtifactPromoter;
  readonly canonicalizePath: PathCanonicalizer;
  readonly isSymbolicLink: PathSymlinkDetector;
  readonly isFile: PathFileDetector;
}

export interface ReleaseNotesFilesystemOptions {
  readonly beforeArtifactRead?: (path: string) => Promise<void>;
}

export function createReleaseNotesFilesystem(
  productDir: string,
  options: ReleaseNotesFilesystemOptions = {},
): ReleaseNotesFilesystem {
  let stageCounter = 0;
  return {
    readArtifact: (path, expectedCanonicalPath) =>
      readCanonicalArtifactWithoutFollowingFinalSymlink(
        path,
        expectedCanonicalPath,
        options.beforeArtifactRead,
      ),
    createArtifactStage: async (_targetCanonicalPath, existingContent) => {
      stageCounter += 1;
      return await createReleaseNotesArtifactStage(productDir, stageCounter, existingContent);
    },
    promoteArtifact: promoteReleaseNotesArtifact,
    canonicalizePath: canonicalizeExistingPath,
    isSymbolicLink: detectSymbolicLink,
    isFile: detectFile,
  };
}

async function createReleaseNotesArtifactStage(
  productDir: string,
  stageCounter: number,
  existingContent?: string,
): Promise<ArtifactStage> {
  const stageWorkingDirectory = join(productDir, STAGING_DIRECTORY_NAME, String(stageCounter));
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
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
  const handle = await openPromotedArtifact(targetCanonicalPath);
  try {
    const openedArtifact = await handle.stat();
    await assertOpenedTargetStillMatches(targetCanonicalPath, openedArtifact);
    await handle.truncate(0);
    await handle.writeFile(content, { encoding: ARTIFACT_TEXT_ENCODING });
  } finally {
    await handle.close();
  }
  const promotedCanonicalPath = await canonicalizeExistingPath(targetCanonicalPath);
  if (promotedCanonicalPath !== targetCanonicalPath) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
}

async function openPromotedArtifact(targetCanonicalPath: string): Promise<FileHandle> {
  try {
    return await open(targetCanonicalPath, ARTIFACT_WRITE_FLAGS);
  } catch {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
}

async function assertOpenedTargetStillMatches(
  targetCanonicalPath: string,
  openedArtifact: Stats,
): Promise<void> {
  const currentCanonicalPath = await canonicalizeExistingPath(targetCanonicalPath);
  if (currentCanonicalPath !== targetCanonicalPath) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
  const currentArtifact = await stat(targetCanonicalPath);
  if (!isSameArtifactIdentity(openedArtifact, currentArtifact)) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
}

async function readCanonicalArtifactWithoutFollowingFinalSymlink(
  path: string,
  expectedCanonicalPath?: string,
  beforeArtifactRead?: (path: string) => Promise<void>,
): Promise<string> {
  const canonicalPath = expectedCanonicalPath ?? await canonicalizeExistingPath(path);
  if (canonicalPath === undefined) {
    throw new ReleaseNotesError(`${RETARGETED_ARTIFACT_ERROR}: ${path}`);
  }
  const handle = await open(canonicalPath, ARTIFACT_READ_FLAGS);
  try {
    const openedArtifact = await handle.stat();
    const currentCanonicalPath = await canonicalizeExistingPath(path);
    if (currentCanonicalPath !== canonicalPath) {
      throw new ReleaseNotesError(`${RETARGETED_ARTIFACT_ERROR}: ${path}`);
    }
    const currentArtifact = await stat(canonicalPath);
    if (!isSameArtifact(openedArtifact, currentArtifact)) {
      throw new ReleaseNotesError(`${RETARGETED_ARTIFACT_ERROR}: ${path}`);
    }
    await beforeArtifactRead?.(canonicalPath);
    const content = await handle.readFile({ encoding: ARTIFACT_TEXT_ENCODING });
    const postReadCanonicalPath = await canonicalizeExistingPath(path);
    if (postReadCanonicalPath !== canonicalPath) {
      throw new ReleaseNotesError(`${RETARGETED_ARTIFACT_ERROR}: ${path}`);
    }
    const postReadArtifact = await stat(canonicalPath);
    if (!isSameArtifact(openedArtifact, postReadArtifact)) {
      throw new ReleaseNotesError(`${RETARGETED_ARTIFACT_ERROR}: ${path}`);
    }
    return content;
  } finally {
    await handle.close();
  }
}

function isSameArtifact(openedArtifact: Stats, currentArtifact: Stats): boolean {
  return isSameArtifactIdentity(openedArtifact, currentArtifact)
    && openedArtifact.size === currentArtifact.size
    && openedArtifact.mtimeMs === currentArtifact.mtimeMs
    && openedArtifact.ctimeMs === currentArtifact.ctimeMs;
}

function isSameArtifactIdentity(openedArtifact: Stats, currentArtifact: Stats): boolean {
  return openedArtifact.dev === currentArtifact.dev
    && openedArtifact.ino === currentArtifact.ino;
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
