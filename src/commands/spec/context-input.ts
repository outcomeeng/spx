import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { resolveConfig } from "@/config/index";
import type { MethodologyConfig } from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import type { Result } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { defaultGitDependencies, type GitDependencies } from "@/lib/git/root";
import { createTrackedPathInclusion, listTrackedPaths } from "@/lib/git/tracked-paths";
import {
  createFilesystemSpecTreeSource,
  decodeContextDocumentUtf8,
  readSpecTree,
  resolveSpecContextTarget,
  type SpecContextAcceptedPath,
  specContextAcceptedPaths,
  type SpecContextKindRegistry,
  specContextOptionalArtifactPaths,
  specContextSuffixCandidates,
  type SpecContextTarget,
  type SpecContextTargetFailure,
  type SpecContextTargetPathFacts,
  type SpecTreeConfig,
  specTreeConfigDescriptor,
  type SpecTreeSnapshot,
} from "@/lib/spec-tree";
import { resolveSpecProductDir, type SpecProductDirWarningHandler } from "./root";

export interface ContextFileSystem {
  readonly createSpecTreeSource: typeof createFilesystemSpecTreeSource;
  readonly realPath: (path: string) => Promise<string>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly resolveMethodologyConfig: typeof resolveMethodologyConfig;
  /** The kind registry the product's configuration selects, from which each output node's Digest opening resolves. */
  readonly resolveKindRegistry: (productDir: string) => Promise<Result<SpecContextKindRegistry>>;
}

/** The kinds the product directory's spec-tree configuration section selects. */
export async function resolveConfiguredKindRegistry(productDir: string): Promise<Result<SpecContextKindRegistry>> {
  const resolved = await resolveConfig(productDir, [specTreeConfigDescriptor]);
  if (!resolved.ok) return resolved;
  const section = resolved.value[specTreeConfigDescriptor.section] as SpecTreeConfig;
  return { ok: true, value: section.kinds };
}

export const defaultContextFileSystem: ContextFileSystem = {
  createSpecTreeSource: createFilesystemSpecTreeSource,
  realPath: realpath,
  readFile,
  resolveMethodologyConfig,
  resolveKindRegistry: resolveConfiguredKindRegistry,
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
  /** The configured kind registry every output node's Digest opening resolves from. */
  readonly registry: SpecContextKindRegistry;
  /**
   * The product-relative paths a projection may select: the paths git tracks
   * when the product is a git repository, else the snapshot's own entries plus
   * every optional artifact present on disk inside the product.
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
  const registry = await fs.resolveKindRegistry(productDir);
  if (!registry.ok) throw new Error(registry.error);
  const acceptedPaths = specContextAcceptedPaths(snapshot);
  const accepted: Array<SpecContextTargetPathFacts["accepted"][number]> = [];
  for (const entry of acceptedPaths) {
    const realPath = await containedCanonicalPath(fs, realRoot, resolve(productDir, entry.path));
    if (realPath !== undefined) accepted.push({ ...entry, realPath });
  }
  const availability = new Map<string, Promise<boolean>>();
  const hasDocument = (path: string): Promise<boolean> => {
    let present = availability.get(path);
    if (present === undefined) {
      present = isPresentInsideProduct(fs, productDir, realRoot, path);
      availability.set(path, present);
    }
    return present;
  };
  const existingPaths = trackedPaths ?? await untrackedPresence(productDir, realRoot, snapshot, fs);
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
    registry: registry.value,
    existingPaths,
    acceptedPaths,
    accepted,
    readDocument,
    hasDocument,
  };
}

/**
 * Outside a git repository nothing scopes the tree, so presence is the
 * filesystem's: the snapshot's own entries and every optional artifact the
 * projection may select that exists inside the product.
 */
async function untrackedPresence(
  productDir: string,
  realRoot: string,
  snapshot: SpecTreeSnapshot,
  fs: ContextFileSystem,
): Promise<ReadonlySet<string>> {
  const present = new Set<string>();
  const candidates = [
    ...snapshot.entries.flatMap((entry) => entry.ref?.path ?? []),
    ...specContextOptionalArtifactPaths(snapshot),
  ];
  for (const path of candidates) {
    if (await isPresentInsideProduct(fs, productDir, realRoot, path)) present.add(path);
  }
  return present;
}

/**
 * The canonical location of an existing path inside the product, or undefined
 * when the path is missing or escapes the product through lexical traversal or
 * a symbolic link.
 */
async function containedCanonicalPath(
  fs: ContextFileSystem,
  realRoot: string,
  path: string,
): Promise<string | undefined> {
  try {
    const canonical = await fs.realPath(path);
    return isPathContained(realRoot, canonical) ? canonical : undefined;
  } catch (error) {
    if (isMissingPath(error)) return undefined;
    throw error;
  }
}

/**
 * A product-relative path escaping the product through a symbolic link is
 * absent for presence, never an error: nothing selects it, so nothing reads it.
 */
async function isPresentInsideProduct(
  fs: ContextFileSystem,
  productDir: string,
  realRoot: string,
  path: string,
): Promise<boolean> {
  return await containedCanonicalPath(fs, realRoot, resolve(productDir, path)) !== undefined;
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
  for (const path of new Set(operandCandidates(input, operand))) {
    // Confinement discards a candidate escaping the product before identities
    // collapse; an operand left with none fails as unresolved.
    const canonical = await containedCanonicalPath(input.fs, input.realRoot, path);
    if (canonical !== undefined) candidates.push(canonical);
  }
  return { accepted: input.accepted, candidates };
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
