import { randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, mkdir, mkdtemp, open, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { normalizeDocumentationPathSeparators, RELEASE_DOCUMENTATION_PATH_SEPARATOR } from "@/domains/release/config";
import type {
  DocumentationFileIdentity,
  DocumentationPromoter,
  DocumentationPromotion,
  DocumentationStager,
  StagedDocumentationReader,
} from "@/domains/release/documentation-sync";
import { type AtomicWriteFileSystem, writeFileAtomic } from "@/lib/atomic-file-write";
import {
  isPathContained,
  isResolvedPathContained,
  PATH_CONTAINMENT_ROOT_CANDIDATE,
} from "@/lib/file-system/pathContainment";

const DOCUMENTATION_TEXT_ENCODING = "utf8";
const DOCUMENTATION_OPEN_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW;
const DOCUMENTATION_STAGE_DIRECTORY_PREFIX = "spx-documentation-sync-stage-";
const DOCUMENTATION_ROLLBACK_FAILURE_MESSAGE = "Documentation promotion rollback failed";
const ATOMIC_WRITE_FILE_SYSTEM: AtomicWriteFileSystem = {
  writeFile: async (path, data) => {
    await writeFile(path, data, DOCUMENTATION_TEXT_ENCODING);
  },
  rename,
  rm: async (path, options) => {
    await rm(path, options);
  },
};

export interface DocumentationSyncFilesystem {
  readonly stageDocumentation: DocumentationStager;
  readonly readDocument: StagedDocumentationReader;
  readonly promoteDocumentation: DocumentationPromoter;
}

export type DocumentationReplacementGuard = () => Promise<void>;

export type DocumentationAtomicWriter = (
  path: string,
  content: string,
  guard: DocumentationReplacementGuard,
) => Promise<DocumentationFileIdentity>;

export interface DocumentationFileHandle {
  readonly stat: () => Promise<Stats>;
  readonly readText: () => Promise<string>;
  readonly close: () => Promise<void>;
}

export type DocumentationFileOpener = (path: string) => Promise<DocumentationFileHandle>;
export type DocumentationCanonicalPathResolver = (path: string) => Promise<string>;

export interface DocumentationSyncFilesystemDependencies {
  readonly openDocumentationFile: DocumentationFileOpener;
  readonly resolveCanonicalDocumentationPath: DocumentationCanonicalPathResolver;
  readonly writeDocumentAtomic: DocumentationAtomicWriter;
}

interface VerifiedDocumentationPath {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly originalIdentity: DocumentationFileIdentity;
  readonly originalContent: string;
}

interface PromotedDocumentation {
  readonly document: DocumentationPromotion;
  readonly promotedIdentity: DocumentationFileIdentity;
}

interface BoundDocumentationSnapshot {
  readonly content: string;
  readonly stats: Stats;
}

export interface DocumentationPathOperations {
  readonly isAbsolute: (path: string) => boolean;
  readonly relative: (from: string, to: string) => string;
  readonly resolve: (...paths: string[]) => string;
  readonly sep: string;
}

const DOCUMENTATION_PATH_OPERATIONS: DocumentationPathOperations = {
  isAbsolute,
  relative,
  resolve,
  sep,
};

const DEFAULT_DOCUMENTATION_SYNC_FILESYSTEM_DEPENDENCIES: DocumentationSyncFilesystemDependencies = {
  openDocumentationFile: async (path) => {
    const handle = await open(path, DOCUMENTATION_OPEN_FLAGS);
    return {
      stat: async () => await handle.stat(),
      readText: async () => (await handle.readFile()).toString(),
      close: async () => await handle.close(),
    };
  },
  resolveCanonicalDocumentationPath: async (path) => await realpath(path),
  writeDocumentAtomic: createDocumentationAtomicWriter(),
};

export function createDocumentationAtomicWriter(
  fileSystem: AtomicWriteFileSystem = ATOMIC_WRITE_FILE_SYSTEM,
): DocumentationAtomicWriter {
  return async (path, content, guard) => {
    let promotedIdentity: DocumentationFileIdentity | undefined;
    await writeFileAtomic(path, content, {
      fs: {
        ...fileSystem,
        rename: async (from, to) => {
          await guard();
          promotedIdentity = toDocumentationFileIdentity(await lstat(from));
          await fileSystem.rename(from, to);
        },
      },
      randomBytes,
    });
    if (promotedIdentity === undefined) {
      throw new Error(`Atomic documentation replacement did not capture file identity: ${path}`);
    }
    return promotedIdentity;
  };
}

export function createDocumentationSyncFilesystem(
  overrides: Partial<DocumentationSyncFilesystemDependencies> = {},
): DocumentationSyncFilesystem {
  const dependencies = { ...DEFAULT_DOCUMENTATION_SYNC_FILESYSTEM_DEPENDENCIES, ...overrides };
  return {
    stageDocumentation: async (productDir, paths) => await stageDocumentationSet(productDir, paths, dependencies),
    readDocument: async (workingDirectory, path) => await readStagedDocumentation(workingDirectory, path, dependencies),
    promoteDocumentation: async (documents) => await promoteDocumentationSet(documents, dependencies),
  };
}

async function readStagedDocumentation(
  workingDirectory: string,
  path: string,
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<string> {
  const canonicalWorkingDirectory = await dependencies.resolveCanonicalDocumentationPath(workingDirectory);
  return (await readBoundDocumentationSnapshot(
    path,
    canonicalWorkingDirectory,
    false,
    dependencies.openDocumentationFile,
    dependencies.resolveCanonicalDocumentationPath,
  )).content;
}

async function stageDocumentationSet(
  productDir: string,
  paths: readonly string[],
  dependencies: DocumentationSyncFilesystemDependencies,
) {
  const canonicalProductDir = await dependencies.resolveCanonicalDocumentationPath(productDir);
  const verified = await Promise.all(
    paths.map(async (sourcePath) => await verifyDocumentationPath(canonicalProductDir, sourcePath, dependencies)),
  );
  assertUniqueDocumentationTargets(verified);
  const workingDirectory = await mkdtemp(join(tmpdir(), DOCUMENTATION_STAGE_DIRECTORY_PREFIX));
  try {
    const documents = await Promise.all(verified.map(async ({
      sourcePath,
      targetPath,
      originalIdentity,
      originalContent,
    }) => {
      const stagedPath = join(workingDirectory, normalizeDocumentationPathSeparators(sourcePath));
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, originalContent, DOCUMENTATION_TEXT_ENCODING);
      return { sourcePath, stagedPath, targetPath, originalIdentity, originalContent };
    }));
    return {
      workingDirectory,
      documents,
      cleanup: async () => await rm(workingDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(workingDirectory, { recursive: true, force: true });
    throw error;
  }
}

function assertUniqueDocumentationTargets(
  documents: readonly VerifiedDocumentationPath[],
): void {
  for (const [index, document] of documents.entries()) {
    const duplicate = documents.slice(0, index).find((candidate) =>
      candidate.targetPath === document.targetPath
      || isSameDocumentationIdentity(candidate.originalIdentity, document.originalIdentity)
    );
    if (duplicate !== undefined) {
      throw new Error(
        `Documentation paths resolve to the same file: ${duplicate.sourcePath}, ${document.sourcePath}`,
      );
    }
  }
}

async function promoteDocumentationSet(
  documents: readonly DocumentationPromotion[],
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<void> {
  await assertDocumentationSetUnchanged(documents, dependencies);
  const promoted: PromotedDocumentation[] = [];
  try {
    for (const document of documents) {
      const promotedIdentity = await replaceDocumentation(
        document.path,
        document.originalIdentity,
        document.originalContent,
        document.content,
        dependencies,
      );
      promoted.push({ document, promotedIdentity });
    }
  } catch (promotionError) {
    const rollbackErrors = await restorePromotedDocumentation(promoted, dependencies);
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [promotionError, ...rollbackErrors],
        DOCUMENTATION_ROLLBACK_FAILURE_MESSAGE,
      );
    }
    throw promotionError;
  }
}

async function assertDocumentationSetUnchanged(
  documents: readonly DocumentationPromotion[],
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<void> {
  await Promise.all(
    documents.map(async (document) => await assertDocumentationUnchanged(document, dependencies)),
  );
}

async function assertDocumentationUnchanged(
  { path, originalIdentity, originalContent }: DocumentationPromotion,
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<void> {
  const currentSnapshot = await readBoundDocumentationSnapshot(
    path,
    undefined,
    true,
    dependencies.openDocumentationFile,
    dependencies.resolveCanonicalDocumentationPath,
  );
  assertDocumentationIdentity(path, originalIdentity, currentSnapshot.stats);
  assertDocumentationContent(path, currentSnapshot.content, originalContent);
}

async function restorePromotedDocumentation(
  promoted: readonly PromotedDocumentation[],
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<readonly unknown[]> {
  const rollbackErrors: unknown[] = [];
  for (const { document, promotedIdentity } of [...promoted].reverse()) {
    try {
      await replaceDocumentation(
        document.path,
        promotedIdentity,
        document.content,
        document.originalContent,
        dependencies,
      );
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

async function verifyDocumentationPath(
  canonicalProductDir: string,
  sourcePath: string,
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<VerifiedDocumentationPath> {
  if (isAbsolute(sourcePath)) {
    throw new Error(`Documentation path must be relative to the product: ${sourcePath}`);
  }
  const targetPath = resolveCanonicalDocumentationTarget(canonicalProductDir, sourcePath);
  if (targetPath === undefined) {
    throw new Error(`Documentation path escapes or is not canonical within the product: ${sourcePath}`);
  }
  const originalSnapshot = await readBoundDocumentationSnapshot(
    targetPath,
    canonicalProductDir,
    true,
    dependencies.openDocumentationFile,
    dependencies.resolveCanonicalDocumentationPath,
  );
  return {
    sourcePath,
    targetPath,
    originalIdentity: toDocumentationFileIdentity(originalSnapshot.stats),
    originalContent: originalSnapshot.content,
  };
}

export function resolveCanonicalDocumentationTarget(
  canonicalProductDir: string,
  sourcePath: string,
  pathOperations: DocumentationPathOperations = DOCUMENTATION_PATH_OPERATIONS,
): string | undefined {
  if (pathOperations.isAbsolute(sourcePath)) return undefined;
  const normalizedSourcePath = normalizeDocumentationPathSeparators(sourcePath);
  const configuredPath = pathOperations.sep === "\\"
    ? normalizedSourcePath.replaceAll(RELEASE_DOCUMENTATION_PATH_SEPARATOR, pathOperations.sep)
    : normalizedSourcePath;
  if (pathOperations.isAbsolute(configuredPath)) return undefined;
  const targetPath = pathOperations.resolve(canonicalProductDir, configuredPath);
  const pathFromRoot = pathOperations.relative(canonicalProductDir, targetPath);
  return pathFromRoot !== PATH_CONTAINMENT_ROOT_CANDIDATE
      && isResolvedPathContained(pathFromRoot, pathOperations.sep, pathOperations.isAbsolute)
    ? targetPath
    : undefined;
}

async function replaceDocumentation(
  path: string,
  expectedIdentity: DocumentationFileIdentity,
  expectedContent: string,
  replacementContent: string,
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<DocumentationFileIdentity> {
  const initialSnapshot = await readBoundDocumentationSnapshot(
    path,
    undefined,
    true,
    dependencies.openDocumentationFile,
    dependencies.resolveCanonicalDocumentationPath,
  );
  assertDocumentationIdentity(path, expectedIdentity, initialSnapshot.stats);
  assertDocumentationContent(path, initialSnapshot.content, expectedContent);
  const guard: DocumentationReplacementGuard = async () => {
    const replacementSnapshot = await readBoundDocumentationSnapshot(
      path,
      undefined,
      true,
      dependencies.openDocumentationFile,
      dependencies.resolveCanonicalDocumentationPath,
    );
    if (!isSameFileIdentity(initialSnapshot.stats, replacementSnapshot.stats)) {
      throw new Error(`Documentation file identity changed before replacement: ${path}`);
    }
    assertDocumentationContent(path, replacementSnapshot.content, expectedContent);
  };
  return await dependencies.writeDocumentAtomic(path, replacementContent, guard);
}

async function readBoundDocumentationSnapshot(
  path: string,
  canonicalRoot: string | undefined,
  requireCanonicalPath: boolean,
  openDocumentationFile: DocumentationFileOpener,
  resolveCanonicalDocumentationPath: DocumentationCanonicalPathResolver,
): Promise<BoundDocumentationSnapshot> {
  return await withBoundDocumentationFile(
    path,
    canonicalRoot,
    requireCanonicalPath,
    openDocumentationFile,
    resolveCanonicalDocumentationPath,
    async (handle, stats, assertPathStillBound) => {
      const content = await handle.readText();
      await assertPathStillBound();
      return { content, stats };
    },
  );
}

async function withBoundDocumentationFile<T>(
  path: string,
  canonicalRoot: string | undefined,
  requireCanonicalPath: boolean,
  openDocumentationFile: DocumentationFileOpener,
  resolveCanonicalDocumentationPath: DocumentationCanonicalPathResolver,
  consume: (
    handle: DocumentationFileHandle,
    stats: Stats,
    assertPathStillBound: DocumentationReplacementGuard,
  ) => Promise<T>,
): Promise<T> {
  const handle = await openDocumentationFile(path);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error(`Documentation path is not a regular file: ${path}`);
    }
    const assertPathStillBound: DocumentationReplacementGuard = async () => {
      await assertDocumentationPathBound(
        path,
        stats,
        canonicalRoot,
        requireCanonicalPath,
        resolveCanonicalDocumentationPath,
      );
    };
    await assertPathStillBound();
    return await consume(handle, stats, assertPathStillBound);
  } finally {
    await handle.close();
  }
}

async function assertDocumentationPathBound(
  path: string,
  openStats: Stats,
  canonicalRoot: string | undefined,
  requireCanonicalPath: boolean,
  resolveCanonicalDocumentationPath: DocumentationCanonicalPathResolver,
): Promise<void> {
  const pathStats = await lstat(path);
  if (pathStats.isSymbolicLink()) {
    throw new Error(`Documentation path is a symbolic link: ${path}`);
  }
  if (!pathStats.isFile()) {
    throw new Error(`Documentation path is not a regular file: ${path}`);
  }
  if (!isSameFileIdentity(openStats, pathStats)) {
    throw new Error(`Documentation file identity changed: ${path}`);
  }
  const canonicalPath = await resolveCanonicalDocumentationPath(path);
  const canonicalPathStats = await lstat(canonicalPath);
  if (!isSameFileIdentity(openStats, canonicalPathStats)) {
    throw new Error(`Documentation file identity changed during canonical resolution: ${path}`);
  }
  if (canonicalRoot !== undefined && !isPathContained(canonicalRoot, canonicalPath)) {
    throw new Error(`Documentation path resolves outside its permitted root: ${path}`);
  }
  if (requireCanonicalPath && canonicalPath !== path) {
    throw new Error(`Documentation path resolves through a symbolic link: ${path}`);
  }
}

function isSameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function toDocumentationFileIdentity(stats: Stats): DocumentationFileIdentity {
  return { device: stats.dev, inode: stats.ino };
}

function isSameDocumentationIdentity(
  left: DocumentationFileIdentity,
  right: DocumentationFileIdentity,
): boolean {
  return left.device === right.device && left.inode === right.inode;
}

function assertDocumentationIdentity(
  path: string,
  expectedIdentity: DocumentationFileIdentity,
  actualStats: Stats,
): void {
  if (!isSameDocumentationIdentity(expectedIdentity, toDocumentationFileIdentity(actualStats))) {
    throw new Error(`Documentation file identity changed after staging: ${path}`);
  }
}

function assertDocumentationContent(
  path: string,
  currentContent: string,
  expectedContent: string,
): void {
  if (currentContent !== expectedContent) {
    throw new Error(`Documentation changed after staging and cannot be promoted: ${path}`);
  }
}
