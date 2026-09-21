import { readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { MethodologyConfig } from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { createTrackedPathInclusion, listTrackedPaths } from "@/lib/git/tracked-paths";
import {
  createFilesystemSpecTreeSource,
  decodeContextDocumentUtf8,
  isLocalOverlayPath,
  readSpecTree,
  resolveSpecContextTarget,
  SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY,
  type SpecContextAcceptedPath,
  specContextAcceptedPaths,
  specContextOptionalArtifactPaths,
  specContextSuffixCandidates,
  type SpecContextTarget,
  type SpecContextTargetFailure,
  type SpecContextTargetPathFacts,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { resolveSpecProductDir, type SpecProductDirWarningHandler } from "./root";

export interface ContextFileSystem {
  readonly createSpecTreeSource: typeof createFilesystemSpecTreeSource;
  readonly realPath: (path: string) => Promise<string>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly readDirectory: (path: string) => Promise<readonly string[]>;
  readonly resolveMethodologyConfig: typeof resolveMethodologyConfig;
}

export const defaultContextFileSystem: ContextFileSystem = {
  createSpecTreeSource: createFilesystemSpecTreeSource,
  realPath: realpath,
  readFile,
  readDirectory: readdir,
  resolveMethodologyConfig,
};

export interface ContextInputOptions {
  readonly cwd?: string;
  readonly gitDependencies?: GitDependencies;
  readonly fileSystem?: ContextFileSystem;
  readonly onWarning?: SpecProductDirWarningHandler;
}

export interface ContextInput {
  readonly cwd: string;
  readonly productDir: string;
  readonly realRoot: string;
  readonly fs: ContextFileSystem;
  readonly snapshot: SpecTreeSnapshot;
  readonly methodology: MethodologyConfig;
  /**
   * The product-relative paths a projection may select: the paths git tracks
   * when the product is a git repository, else the snapshot's own entries plus
   * every optional artifact and overlay present on disk inside the product.
   */
  readonly existingPaths: ReadonlySet<string>;
  readonly acceptedPaths: readonly SpecContextAcceptedPath[];
  readonly accepted: SpecContextTargetPathFacts["accepted"];
  readonly readDocument: (path: string) => Promise<string>;
  readonly hasDocument: (path: string) => Promise<boolean>;
}

export async function readContextInput(options: ContextInputOptions): Promise<ContextInput> {
  const cwd = options.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = options.gitDependencies ?? defaultGitDependencies;
  const fs = options.fileSystem ?? defaultContextFileSystem;
  const productDir = await resolveSpecProductDir(cwd, git, options.onWarning);
  const realRoot = await fs.realPath(productDir);
  const trackedPaths = await listTrackedPaths(productDir, git);
  const includePath = createTrackedPathInclusion(trackedPaths);
  const snapshot = await readSpecTree({ source: fs.createSpecTreeSource({ productDir, includePath }) });
  const methodology = await fs.resolveMethodologyConfig(productDir);
  if (!methodology.ok) throw new Error(methodology.error);
  const acceptedPaths = specContextAcceptedPaths(snapshot);
  const accepted: Array<SpecContextTargetPathFacts["accepted"][number]> = [];
  for (const entry of acceptedPaths) {
    try {
      const path = await fs.realPath(resolve(productDir, entry.path));
      if (isPathContained(realRoot, path)) accepted.push({ ...entry, realPath: path });
    } catch (error) {
      if (!isMissingPath(error)) throw error;
    }
  }
  const availability = new Map<string, Promise<boolean>>();
  const hasDocument = (path: string): Promise<boolean> => {
    let present = availability.get(path);
    if (present === undefined) {
      present = (async () => {
        try {
          const canonical = await fs.realPath(resolve(productDir, path));
          if (!isPathContained(realRoot, canonical)) throw new Error(`Outside-product context document: ${path}`);
          return true;
        } catch (error) {
          if (isMissingPath(error)) return false;
          throw error;
        }
      })();
      availability.set(path, present);
    }
    return present;
  };
  const existingPaths = trackedPaths ?? await untrackedPresence(productDir, snapshot, fs, hasDocument);
  const documents = new Map<string, Promise<string>>();
  const readDocument = (path: string): Promise<string> => {
    let document = documents.get(path);
    if (document === undefined) {
      document = (async () => {
        if (!existingPaths.has(path) || !isPathContained(productDir, resolve(productDir, path))) {
          throw new Error(`Untracked or outside-product context document: ${path}`);
        }
        const canonical = await fs.realPath(resolve(productDir, path));
        if (!isPathContained(realRoot, canonical)) throw new Error(`Outside-product context document: ${path}`);
        const bytes = await fs.readFile(canonical);
        try {
          return decodeContextDocumentUtf8(bytes);
        } catch {
          throw new Error(`Invalid UTF-8 context document: ${path}`);
        }
      })();
      documents.set(path, document);
    }
    return document;
  };
  return {
    cwd,
    productDir,
    realRoot,
    fs,
    snapshot,
    methodology: methodology.value,
    existingPaths,
    acceptedPaths,
    accepted,
    readDocument,
    hasDocument,
  };
}

/**
 * Outside a git repository nothing scopes the tree, so presence is the
 * filesystem's: the snapshot's own entries, every optional artifact the
 * projection may select that exists inside the product, and every overlay
 * file directly inside the overlay directory.
 */
async function untrackedPresence(
  productDir: string,
  snapshot: SpecTreeSnapshot,
  fs: ContextFileSystem,
  hasDocument: (path: string) => Promise<boolean>,
): Promise<ReadonlySet<string>> {
  const present = new Set<string>();
  const candidates = [
    ...snapshot.entries.flatMap((entry) => entry.ref?.path ?? []),
    ...specContextOptionalArtifactPaths(snapshot),
  ];
  for (const path of candidates) {
    if (await hasDocument(path)) present.add(path);
  }
  let overlayEntries: readonly string[] = [];
  try {
    overlayEntries = await fs.readDirectory(resolve(productDir, SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY));
  } catch (error) {
    if (!isMissingPath(error)) throw error;
  }
  for (const name of overlayEntries) {
    const path = `${SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY}/${name}`;
    if (isLocalOverlayPath(path) && await hasDocument(path)) present.add(path);
  }
  return present;
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function operandCandidates(input: ContextInput, operand: string): readonly string[] {
  if (operand.length === 0) return [];
  if (isAbsolute(operand)) return [operand];
  return [
    resolve(input.cwd, operand),
    resolve(input.productDir, operand),
    ...specContextSuffixCandidates(input.acceptedPaths, operand).map((path) => resolve(input.productDir, path)),
  ];
}

async function operandFacts(input: ContextInput, operand: string): Promise<SpecContextTargetPathFacts> {
  const candidates: string[] = [];
  let outsideProduct = false;
  let unsupportedArtifact = false;
  for (const path of new Set(operandCandidates(input, operand))) {
    try {
      const canonical = await input.fs.realPath(path);
      if (!isPathContained(input.realRoot, canonical)) outsideProduct = true;
      else {
        candidates.push(canonical);
        if (!input.accepted.some((entry) => entry.realPath === canonical)) unsupportedArtifact = true;
      }
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      if (!isPathContained(input.productDir, path)) outsideProduct = true;
    }
  }
  return { accepted: input.accepted, candidates, outsideProduct, unsupportedArtifact };
}

export async function resolveContextTargets(
  input: ContextInput,
  operands: readonly string[],
): Promise<
  { readonly ok: true; readonly targets: readonly SpecContextTarget[] } | {
    readonly ok: false;
    readonly failure: SpecContextTargetFailure;
  }
> {
  const targets = new Map<string, SpecContextTarget>();
  for (const operand of operands) {
    const result = resolveSpecContextTarget(operand, await operandFacts(input, operand));
    if (!result.ok) return result;
    targets.set(result.target.path, result.target);
  }
  return { ok: true, targets: [...targets.values()] };
}
