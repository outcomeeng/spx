import { randomBytes } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  DocumentationPromoter,
  DocumentationReader,
  DocumentationStager,
} from "@/domains/release/documentation-sync";
import { type AtomicWriteFileSystem, writeFileAtomic } from "@/lib/atomic-file-write";

const DOCUMENTATION_TEXT_ENCODING = "utf8";
const DOCUMENTATION_STAGE_DIRECTORY_PREFIX = "spx-documentation-sync-stage-";
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

interface VerifiedDocumentationPath {
  readonly sourcePath: string;
  readonly targetPath: string;
}

export function createDocumentationSyncFilesystem(): DocumentationSyncFilesystem {
  return {
    stageDocumentation: stageDocumentationSet,
    readDocument: async (path) => await readFile(path, DOCUMENTATION_TEXT_ENCODING),
    promoteDocumentation: promoteDocumentationSet,
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
      const stagedPath = join(workingDirectory, sourcePath);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, await readFile(targetPath, DOCUMENTATION_TEXT_ENCODING), DOCUMENTATION_TEXT_ENCODING);
      return { sourcePath, stagedPath, targetPath };
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
  documents: readonly { readonly path: string; readonly content: string }[],
): Promise<void> {
  await Promise.all(documents.map(async ({ path }) => await verifyCanonicalTarget(path)));
  for (const { path, content } of documents) {
    await verifyCanonicalTarget(path);
    await writeFileAtomic(path, content, {
      fs: ATOMIC_WRITE_FILE_SYSTEM,
      randomBytes,
    });
  }
}

async function verifyDocumentationPath(
  canonicalProductDir: string,
  sourcePath: string,
): Promise<VerifiedDocumentationPath> {
  if (isAbsolute(sourcePath)) {
    throw new Error(`Documentation path must be relative to the product: ${sourcePath}`);
  }
  const targetPath = resolve(canonicalProductDir, sourcePath);
  if (!isContainedPath(canonicalProductDir, targetPath) || relative(canonicalProductDir, targetPath) !== sourcePath) {
    throw new Error(`Documentation path escapes or is not canonical within the product: ${sourcePath}`);
  }
  await verifyCanonicalTarget(targetPath);
  return { sourcePath, targetPath };
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

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot.length > 0
    && pathFromRoot !== ".."
    && !pathFromRoot.startsWith(`..${sep}`)
    && !isAbsolute(pathFromRoot);
}
