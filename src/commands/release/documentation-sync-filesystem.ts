import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { normalizeDocumentationPathSeparators, RELEASE_DOCUMENTATION_PATH_SEPARATOR } from "@/domains/release/config";
import type {
  DocumentationPromoter,
  DocumentationPromotion,
  DocumentationReader,
  DocumentationStager,
} from "@/domains/release/documentation-sync";
import { type AtomicWriteFileSystem, writeFileAtomic } from "@/lib/atomic-file-write";

const DOCUMENTATION_TEXT_ENCODING = "utf8";
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
  readonly readDocument: DocumentationReader;
  readonly promoteDocumentation: DocumentationPromoter;
}

export type DocumentationAtomicWriter = (path: string, content: string) => Promise<void>;

export interface DocumentationSyncFilesystemDependencies {
  readonly writeDocumentAtomic: DocumentationAtomicWriter;
}

interface VerifiedDocumentationPath {
  readonly sourcePath: string;
  readonly targetPath: string;
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
  writeDocumentAtomic: async (path, content) => {
    await writeFileAtomic(path, content, {
      fs: ATOMIC_WRITE_FILE_SYSTEM,
      randomBytes,
    });
  },
};

export function createDocumentationSyncFilesystem(
  dependencies: DocumentationSyncFilesystemDependencies = DEFAULT_DOCUMENTATION_SYNC_FILESYSTEM_DEPENDENCIES,
): DocumentationSyncFilesystem {
  return {
    stageDocumentation: stageDocumentationSet,
    readDocument: async (path) => await readFile(path, DOCUMENTATION_TEXT_ENCODING),
    promoteDocumentation: async (documents) => await promoteDocumentationSet(documents, dependencies),
  };
}

async function stageDocumentationSet(
  productDir: string,
  paths: readonly string[],
) {
  const canonicalProductDir = await realpath(productDir);
  const verified = await Promise.all(
    paths.map(async (sourcePath) => await verifyDocumentationPath(canonicalProductDir, sourcePath)),
  );
  const workingDirectory = await mkdtemp(join(tmpdir(), DOCUMENTATION_STAGE_DIRECTORY_PREFIX));
  try {
    const documents = await Promise.all(verified.map(async ({ sourcePath, targetPath }) => {
      const stagedPath = join(workingDirectory, normalizeDocumentationPathSeparators(sourcePath));
      const originalContent = await readFile(targetPath, DOCUMENTATION_TEXT_ENCODING);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, originalContent, DOCUMENTATION_TEXT_ENCODING);
      return { sourcePath, stagedPath, targetPath, originalContent };
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

async function promoteDocumentationSet(
  documents: readonly DocumentationPromotion[],
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<void> {
  await assertDocumentationSetUnchanged(documents);
  const promoted: DocumentationPromotion[] = [];
  try {
    for (const document of documents) {
      const { path, content } = document;
      await verifyCanonicalTarget(path);
      await dependencies.writeDocumentAtomic(path, content);
      promoted.push(document);
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
): Promise<void> {
  await Promise.all(documents.map(async ({ path, originalContent }) => {
    await verifyCanonicalTarget(path);
    const currentContent = await readFile(path, DOCUMENTATION_TEXT_ENCODING);
    if (currentContent !== originalContent) {
      throw new Error(`Documentation changed after staging and cannot be promoted: ${path}`);
    }
  }));
}

async function restorePromotedDocumentation(
  promoted: readonly DocumentationPromotion[],
  dependencies: DocumentationSyncFilesystemDependencies,
): Promise<readonly unknown[]> {
  const rollbackErrors: unknown[] = [];
  for (const { path, originalContent } of [...promoted].reverse()) {
    try {
      await verifyCanonicalTarget(path);
      await dependencies.writeDocumentAtomic(path, originalContent);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  return rollbackErrors;
}

async function verifyDocumentationPath(
  canonicalProductDir: string,
  sourcePath: string,
): Promise<VerifiedDocumentationPath> {
  if (isAbsolute(sourcePath)) {
    throw new Error(`Documentation path must be relative to the product: ${sourcePath}`);
  }
  const targetPath = resolveCanonicalDocumentationTarget(canonicalProductDir, sourcePath);
  if (targetPath === undefined) {
    throw new Error(`Documentation path escapes or is not canonical within the product: ${sourcePath}`);
  }
  await verifyCanonicalTarget(targetPath);
  return { sourcePath, targetPath };
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
  return isContainedPath(pathFromRoot, pathOperations)
      && pathFromRoot === configuredPath
    ? targetPath
    : undefined;
}

async function verifyCanonicalTarget(targetPath: string): Promise<void> {
  const stats = await lstat(targetPath);
  if (stats.isSymbolicLink()) {
    throw new Error(`Documentation path is a symbolic link: ${targetPath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Documentation path is not a regular file: ${targetPath}`);
  }
  if (await realpath(targetPath) !== targetPath) {
    throw new Error(`Documentation path resolves through a symbolic link: ${targetPath}`);
  }
}

function isContainedPath(
  pathFromRoot: string,
  pathOperations: DocumentationPathOperations,
): boolean {
  return pathFromRoot.length > 0
    && pathFromRoot !== ".."
    && !pathFromRoot.startsWith(`..${pathOperations.sep}`)
    && !pathOperations.isAbsolute(pathFromRoot);
}
