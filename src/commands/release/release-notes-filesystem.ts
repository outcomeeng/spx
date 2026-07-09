import { constants as fsConstants } from "node:fs";
import type { Stats } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, mkdir, mkdtemp, open, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
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
const ARTIFACT_EXISTING_WRITE_FLAGS = fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW;
const ARTIFACT_CREATE_WRITE_FLAGS = ARTIFACT_EXISTING_WRITE_FLAGS | fsConstants.O_CREAT | fsConstants.O_EXCL;
const DIRECTORY_READ_FLAGS = fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW;
const RETARGETED_ARTIFACT_ERROR = "Opened changelog path changed before read-back validation completed";
const RETARGETED_PROMOTION_ERROR = "Changelog promotion target changed before final write";
const STAGING_DIRECTORY_PREFIX = "spx-release-notes-stage-";
const STAGING_FILE_NAME = "CHANGELOG.md";
const FILE_ALREADY_EXISTS_ERROR_CODE = "EEXIST";

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
  readonly beforeDirectoryCreate?: (path: string) => Promise<void>;
  readonly beforeArtifactPromotion?: (path: string) => Promise<void>;
  readonly beforeFinalArtifactWrite?: (path: string) => Promise<void>;
  readonly beforeStageArtifactRead?: (path: string) => Promise<void>;
}

export function createReleaseNotesFilesystem(options: ReleaseNotesFilesystemOptions = {}): ReleaseNotesFilesystem {
  return {
    readArtifact: (path, expectedCanonicalPath) =>
      readCanonicalArtifactWithoutFollowingFinalSymlink(
        path,
        expectedCanonicalPath,
        options.beforeArtifactRead,
        path === expectedCanonicalPath ? options.beforeStageArtifactRead : undefined,
      ),
    createArtifactStage: async (_targetCanonicalPath, existingContent) => {
      return await createReleaseNotesArtifactStage(existingContent);
    },
    promoteArtifact: (stagedCanonicalPath, targetCanonicalPath, content) =>
      promoteReleaseNotesArtifact(
        stagedCanonicalPath,
        targetCanonicalPath,
        content,
        options,
      ),
    canonicalizePath: canonicalizeExistingPath,
    isSymbolicLink: detectSymbolicLink,
    isFile: detectFile,
  };
}

async function createReleaseNotesArtifactStage(
  existingContent?: string,
): Promise<ArtifactStage> {
  const stageWorkingDirectory = await mkdtemp(join(tmpdir(), STAGING_DIRECTORY_PREFIX));
  const canonicalStageDirectory = await canonicalizeExistingPath(stageWorkingDirectory);
  if (canonicalStageDirectory === undefined) {
    throw new ReleaseNotesError(
      `Release-notes staging directory cannot be canonicalized: ${stageWorkingDirectory}`,
    );
  }
  const stagePath = join(canonicalStageDirectory, STAGING_FILE_NAME);
  if (existingContent !== undefined) {
    await writeArtifactInVerifiedDirectory(
      canonicalStageDirectory,
      STAGING_FILE_NAME,
      existingContent,
      RETARGETED_ARTIFACT_ERROR,
    );
  }
  return {
    workingDirectory: canonicalStageDirectory,
    path: stagePath,
    cleanup: async () => {
      await rm(canonicalStageDirectory, { force: true, recursive: true });
    },
  };
}

async function promoteReleaseNotesArtifact(
  _stagedCanonicalPath: string,
  targetCanonicalPath: string,
  _content: string,
  options: ReleaseNotesFilesystemOptions,
): Promise<void> {
  const targetDirectory = dirname(targetCanonicalPath);
  await ensureCanonicalDirectory(targetDirectory, options);
  await promoteIntoVerifiedDirectory(
    targetCanonicalPath,
    _content,
    options,
  );
  const promotedCanonicalPath = await canonicalizeExistingPath(targetCanonicalPath);
  if (promotedCanonicalPath !== targetCanonicalPath) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
}

async function ensureCanonicalDirectory(
  targetDirectory: string,
  options: ReleaseNotesFilesystemOptions,
): Promise<void> {
  const canonicalTargetDirectory = await canonicalizeExistingPath(targetDirectory);
  if (canonicalTargetDirectory !== undefined) {
    if (canonicalTargetDirectory !== targetDirectory) {
      throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetDirectory}`);
    }
    return;
  }
  const nearestDirectory = await nearestExistingVerifiedDirectory(targetDirectory);
  await options.beforeDirectoryCreate?.(targetDirectory);
  await assertDirectoryStillMatches(
    nearestDirectory.path,
    nearestDirectory.stats,
    RETARGETED_PROMOTION_ERROR,
  );
  await mkdir(targetDirectory, { recursive: true });
  const createdCanonicalDirectory = await canonicalizeExistingPath(targetDirectory);
  if (createdCanonicalDirectory !== targetDirectory) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetDirectory}`);
  }
}

async function promoteIntoVerifiedDirectory(
  targetCanonicalPath: string,
  content: string,
  options: ReleaseNotesFilesystemOptions,
): Promise<void> {
  const targetDirectory = dirname(targetCanonicalPath);
  const directoryHandle = await openVerifiedDirectory(targetDirectory, RETARGETED_PROMOTION_ERROR);
  let artifactHandle: FileHandle | undefined;
  try {
    await assertDirectoryStillMatches(targetDirectory, directoryHandle.stats, RETARGETED_PROMOTION_ERROR);
    await assertPromotionTargetStillMatches(targetCanonicalPath);
    artifactHandle = await openWritableArtifact(targetCanonicalPath, RETARGETED_PROMOTION_ERROR);
    const openedArtifact = await artifactHandle.stat();
    await assertOpenedTargetStillMatches(targetCanonicalPath, openedArtifact, RETARGETED_PROMOTION_ERROR);
    await options.beforeArtifactPromotion?.(targetCanonicalPath);
    await assertDirectoryStillMatches(targetDirectory, directoryHandle.stats, RETARGETED_PROMOTION_ERROR);
    await assertPromotionTargetStillMatches(targetCanonicalPath);
    await assertOpenedTargetStillMatches(targetCanonicalPath, openedArtifact, RETARGETED_PROMOTION_ERROR);
    await options.beforeFinalArtifactWrite?.(targetCanonicalPath);
    await artifactHandle.truncate(0);
    await artifactHandle.writeFile(content, { encoding: ARTIFACT_TEXT_ENCODING });
    await assertOpenedTargetStillMatches(targetCanonicalPath, openedArtifact, RETARGETED_PROMOTION_ERROR);
    await assertDirectoryStillMatches(targetDirectory, directoryHandle.stats, RETARGETED_PROMOTION_ERROR);
  } finally {
    await artifactHandle?.close();
    await directoryHandle.handle.close();
  }
}

async function writeArtifactInVerifiedDirectory(
  directoryCanonicalPath: string,
  fileName: string,
  content: string,
  errorMessage: string,
): Promise<void> {
  const directoryHandle = await openVerifiedDirectory(directoryCanonicalPath, errorMessage);
  try {
    await assertDirectoryStillMatches(directoryCanonicalPath, directoryHandle.stats, errorMessage);
    const targetCanonicalPath = join(directoryCanonicalPath, fileName);
    const handle = await openWritableArtifact(targetCanonicalPath, errorMessage);
    try {
      const openedArtifact = await handle.stat();
      await assertOpenedTargetStillMatches(targetCanonicalPath, openedArtifact, errorMessage);
      await handle.truncate(0);
      await handle.writeFile(content, { encoding: ARTIFACT_TEXT_ENCODING });
    } finally {
      await handle.close();
    }
    await assertDirectoryStillMatches(directoryCanonicalPath, directoryHandle.stats, errorMessage);
  } finally {
    await directoryHandle.handle.close();
  }
}

interface VerifiedDirectoryHandle {
  readonly handle: FileHandle;
  readonly stats: Stats;
}

interface VerifiedDirectory {
  readonly path: string;
  readonly stats: Stats;
}

async function openVerifiedDirectory(
  directoryCanonicalPath: string,
  errorMessage: string,
): Promise<VerifiedDirectoryHandle> {
  try {
    const handle = await open(directoryCanonicalPath, DIRECTORY_READ_FLAGS);
    return {
      handle,
      stats: await handle.stat(),
    };
  } catch {
    throw new ReleaseNotesError(`${errorMessage}: ${directoryCanonicalPath}`);
  }
}

async function nearestExistingVerifiedDirectory(targetDirectory: string): Promise<VerifiedDirectory> {
  const existingDirectoryPath = await nearestExistingDirectoryPath(targetDirectory);
  const canonicalPath = await canonicalizeExistingPath(existingDirectoryPath);
  if (canonicalPath !== existingDirectoryPath) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetDirectory}`);
  }
  const stats = await stat(existingDirectoryPath);
  if (!stats.isDirectory()) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetDirectory}`);
  }
  return {
    path: existingDirectoryPath,
    stats,
  };
}

async function nearestExistingDirectoryPath(path: string): Promise<string> {
  const canonicalPath = await canonicalizeExistingPath(path);
  if (canonicalPath !== undefined) {
    return path;
  }
  const parentPath = dirname(path);
  if (parentPath === path) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${path}`);
  }
  return await nearestExistingDirectoryPath(parentPath);
}

async function openWritableArtifact(
  targetCanonicalPath: string,
  errorMessage: string,
): Promise<FileHandle> {
  try {
    return await open(targetCanonicalPath, ARTIFACT_EXISTING_WRITE_FLAGS);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw new ReleaseNotesError(`${errorMessage}: ${targetCanonicalPath}`);
    }
  }
  try {
    return await open(targetCanonicalPath, ARTIFACT_CREATE_WRITE_FLAGS);
  } catch (error) {
    if (isFileAlreadyExistsError(error)) {
      return await openWritableArtifact(targetCanonicalPath, errorMessage);
    }
    throw new ReleaseNotesError(`${errorMessage}: ${targetCanonicalPath}`);
  }
}

async function assertDirectoryStillMatches(
  directoryCanonicalPath: string,
  openedDirectory: Stats,
  errorMessage: string,
): Promise<void> {
  const currentCanonicalPath = await canonicalizeExistingPath(directoryCanonicalPath);
  if (currentCanonicalPath !== directoryCanonicalPath) {
    throw new ReleaseNotesError(`${errorMessage}: ${directoryCanonicalPath}`);
  }
  const currentDirectory = await stat(directoryCanonicalPath);
  if (!isSameArtifactIdentity(openedDirectory, currentDirectory)) {
    throw new ReleaseNotesError(`${errorMessage}: ${directoryCanonicalPath}`);
  }
}

async function assertOpenedTargetStillMatches(
  targetCanonicalPath: string,
  openedArtifact: Stats,
  errorMessage: string,
): Promise<void> {
  const currentCanonicalPath = await canonicalizeExistingPath(targetCanonicalPath);
  if (currentCanonicalPath !== targetCanonicalPath) {
    throw new ReleaseNotesError(`${errorMessage}: ${targetCanonicalPath}`);
  }
  const currentArtifact = await stat(targetCanonicalPath);
  if (!isSameArtifactIdentity(openedArtifact, currentArtifact)) {
    throw new ReleaseNotesError(`${errorMessage}: ${targetCanonicalPath}`);
  }
}

async function assertPromotionTargetStillMatches(targetCanonicalPath: string): Promise<void> {
  const currentCanonicalPath = await canonicalizeExistingPath(targetCanonicalPath);
  if (currentCanonicalPath !== undefined && currentCanonicalPath !== targetCanonicalPath) {
    throw new ReleaseNotesError(`${RETARGETED_PROMOTION_ERROR}: ${targetCanonicalPath}`);
  }
}

async function readCanonicalArtifactWithoutFollowingFinalSymlink(
  path: string,
  expectedCanonicalPath?: string,
  beforeArtifactRead?: (path: string) => Promise<void>,
  beforeArtifactOpen?: (path: string) => Promise<void>,
): Promise<string> {
  const canonicalPath = expectedCanonicalPath ?? await canonicalizeExistingPath(path);
  if (canonicalPath === undefined) {
    throw new ReleaseNotesError(`${RETARGETED_ARTIFACT_ERROR}: ${path}`);
  }
  await beforeArtifactOpen?.(canonicalPath);
  const handle = await openReadableArtifact(canonicalPath, RETARGETED_ARTIFACT_ERROR);
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

async function openReadableArtifact(
  targetCanonicalPath: string,
  errorMessage: string,
): Promise<FileHandle> {
  try {
    return await open(targetCanonicalPath, ARTIFACT_READ_FLAGS);
  } catch {
    throw new ReleaseNotesError(`${errorMessage}: ${targetCanonicalPath}`);
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

function isFileAlreadyExistsError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === FILE_ALREADY_EXISTS_ERROR_CODE;
}
