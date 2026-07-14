import { readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

import { resolveMethodologyIdentity } from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import {
  decodeContextDocumentUtf8,
  extractDecisionCitations,
  formatInvalidContextDocumentError,
  formatMissingCitedDecisionError,
  formatUnreadableContextDocumentError,
  isLocalOverlayPath,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_READ_ROLE,
  specContextBootstrap,
  specContextDigest,
  type SpecContextListedEntry,
  type SpecContextListedRole,
  type SpecContextManifest,
  type SpecContextReadDocument,
  type SpecContextReadRole,
} from "@/domains/spec/context-manifest";
import { resolveSpecContextTarget, type SpecContextTargetFailure } from "@/domains/spec/context-target";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { isPathContained } from "@/lib/file-system/pathContainment";
import { defaultGitDependencies } from "@/lib/git/root";
import type { GitDependencies } from "@/lib/git/root";
import {
  createTrackedPathInclusion,
  listTrackedPaths,
  TRACKED_PATH_DIRECTORY_SEPARATOR,
} from "@/lib/git/tracked-paths";
import {
  createFilesystemSpecTreeSource,
  readSpecTree,
  SPEC_TREE_CONFIG,
  SPEC_TREE_ENTRY_TYPE,
  SPEC_TREE_GRAMMAR,
  type SpecTreeDecision,
  type SpecTreeEvidenceSourceEntry,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { resolveSpecProductDir, type SpecProductDirWarningHandler } from "./root";

export type SpecContextManifestResolution =
  | { readonly ok: true; readonly manifest: SpecContextManifest }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

export interface ContextOptions {
  readonly target: string;
  readonly cwd?: string;
  /** When true, every read-class entry carries the document's exact content, digest, and byte count. */
  readonly content?: boolean;
  readonly gitDependencies?: GitDependencies;
  readonly onWarning?: SpecProductDirWarningHandler;
}

const JSON_INDENTATION = 2;
const SPEC_TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;

export const SPEC_CONTEXT_TEXT_LABEL = {
  TARGET: "Target",
  PRODUCT_ROOT: "Product root",
  METHODOLOGY: "Methodology",
  SCHEMA_VERSION: "Schema version",
  BOOTSTRAP: "Bootstrap",
  READ: "Read",
  LISTED: "Listed",
} as const;

const TEXT_LIST_INDENT = "  - ";

type PathInclusion = (path: string) => boolean | Promise<boolean>;

function refPath(ref: SpecTreeSourceRef | undefined): string | undefined {
  return ref?.path;
}

function sortPaths(paths: readonly string[]): readonly string[] {
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function fullSpecPath(path: string): string {
  return path.startsWith(SPEC_TREE_ROOT_PREFIX) ? path : `${SPEC_TREE_ROOT_PREFIX}${path}`;
}

function childSpecPath(parent: string, child: string): string {
  return `${parent}${TRACKED_PATH_DIRECTORY_SEPARATOR}${child}`;
}

async function pushExistingReadDocument(
  read: SpecContextReadDocument[],
  role: SpecContextReadRole,
  productDir: string,
  path: string | undefined,
  includePath: PathInclusion,
): Promise<void> {
  if (path === undefined || !await optionalSpecTreeFile(productDir, path, includePath)) {
    return;
  }
  read.push({ role, path });
}

async function pushExistingListedEntry(
  listed: SpecContextListedEntry[],
  role: SpecContextListedRole,
  productDir: string,
  path: string | undefined,
  includePath: PathInclusion,
): Promise<void> {
  if (path === undefined || !await optionalSpecTreeFile(productDir, path, includePath)) {
    return;
  }
  listed.push({ role, path });
}

function ancestorsFor(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeNode[] {
  const byId = new Map(snapshot.allNodes.map((node) => [node.id, node]));
  const ancestors: SpecTreeNode[] = [];
  let currentParent = target.parentId;
  while (currentParent !== undefined) {
    const parent = byId.get(currentParent);
    if (parent === undefined) break;
    ancestors.unshift(parent);
    currentParent = parent.parentId;
  }
  return ancestors;
}

function siblingsFor(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeNode[] {
  return snapshot.allNodes
    .filter((node) => node.parentId === target.parentId && node.id !== target.id);
}

function lowerIndexSiblingsForContextNodes(
  snapshot: SpecTreeSnapshot,
  contextNodes: readonly SpecTreeNode[],
): readonly SpecTreeNode[] {
  const seen = new Set<string>();
  const lowerSiblings: SpecTreeNode[] = [];
  for (const contextNode of contextNodes) {
    for (const sibling of siblingsFor(snapshot, contextNode)) {
      if (sibling.order >= contextNode.order || seen.has(sibling.id)) continue;
      lowerSiblings.push(sibling);
      seen.add(sibling.id);
    }
  }
  lowerSiblings.sort((left, right) => {
    const parentComparison = (left.parentId ?? "").localeCompare(right.parentId ?? "");
    if (parentComparison !== 0) return parentComparison;
    const orderComparison = left.order - right.order;
    if (orderComparison !== 0) return orderComparison;
    return left.id.localeCompare(right.id);
  });
  return lowerSiblings;
}

function decisionsFor(
  snapshot: SpecTreeSnapshot,
  contextNodes: readonly SpecTreeNode[],
): readonly SpecTreeDecision[] {
  const constrainingOrderByParentId = new Map(
    contextNodes.map((node) => [node.parentId, node.order] as const),
  );
  const targetId = contextNodes.at(-1)?.id;
  return snapshot.decisions.filter((decision) => {
    if (decision.parentId === targetId) return true;
    const constrainingOrder = constrainingOrderByParentId.get(decision.parentId);
    return constrainingOrder !== undefined && decision.order < constrainingOrder;
  });
}

function evidenceFor(snapshot: SpecTreeSnapshot, target: SpecTreeNode): readonly SpecTreeEvidenceSourceEntry[] {
  return snapshot.entries.filter(
    (entry): entry is SpecTreeEvidenceSourceEntry =>
      entry.type === SPEC_TREE_ENTRY_TYPE.EVIDENCE && entry.parentId === target.id,
  );
}

/**
 * The canonical absolute location of a product document, or undefined when the
 * path — before or after resolving symbolic links — escapes the canonical
 * product root or names no existing file. This is the read boundary the node's
 * governing decision fixes, independent of git tracked-path scoping.
 */
async function containedDocumentPath(productDir: string, specTreePath: string): Promise<string | undefined> {
  if (!isPathContained(productDir, specTreePath)) return undefined;
  let canonicalRoot: string;
  let canonicalDocument: string;
  try {
    canonicalRoot = await realpath(productDir);
    canonicalDocument = await realpath(resolve(productDir, specTreePath));
  } catch {
    return undefined;
  }
  return isPathContained(canonicalRoot, canonicalDocument) ? canonicalDocument : undefined;
}

async function optionalSpecTreeFile(
  productDir: string,
  specTreePath: string,
  includePath: PathInclusion,
): Promise<string | undefined> {
  if (!await includePath(specTreePath)) return undefined;
  return await containedDocumentPath(productDir, specTreePath) === undefined ? undefined : specTreePath;
}

async function pushCoordinationDocuments(
  read: SpecContextReadDocument[],
  productDir: string,
  contextNodes: readonly SpecTreeNode[],
  includePath: PathInclusion,
): Promise<void> {
  const directories = [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    ...contextNodes.map((node) => fullSpecPath(node.id)),
  ];
  for (const directory of directories) {
    for (const filename of SPEC_TREE_GRAMMAR.COORDINATION_NOTES) {
      await pushExistingReadDocument(
        read,
        SPEC_CONTEXT_READ_ROLE.COORDINATION,
        productDir,
        childSpecPath(directory, filename),
        includePath,
      );
    }
  }
}

async function pushGuideDocuments(
  read: SpecContextReadDocument[],
  productDir: string,
  contextNodes: readonly SpecTreeNode[],
  includePath: PathInclusion,
): Promise<void> {
  const directories = ["", ...contextNodes.map((node) => fullSpecPath(node.id))];
  for (const directory of directories) {
    for (const filename of SPEC_TREE_GRAMMAR.GUIDE_FILES) {
      await pushExistingReadDocument(
        read,
        SPEC_CONTEXT_READ_ROLE.GUIDE,
        productDir,
        directory === "" ? filename : childSpecPath(directory, filename),
        includePath,
      );
    }
  }
}

async function readContextDocumentBytes(productDir: string, path: string): Promise<Buffer> {
  const absolute = await containedDocumentPath(productDir, path);
  if (absolute === undefined) {
    throw new Error(formatUnreadableContextDocumentError(path));
  }
  try {
    return await readFile(absolute);
  } catch {
    throw new Error(formatUnreadableContextDocumentError(path));
  }
}

function decodeContextDocumentOrThrow(path: string, rawBytes: Buffer): string {
  try {
    return decodeContextDocumentUtf8(rawBytes);
  } catch {
    throw new Error(formatInvalidContextDocumentError(path));
  }
}

/**
 * Resolves full-path decision citations from the structural spec and decision
 * documents, transitively through cited decisions, preserving citing-file
 * provenance. A citation whose decision file is absent from the tracked tree
 * fails the projection naming both exact paths.
 */
async function citedDecisionDocuments(
  productDir: string,
  sources: readonly SpecContextReadDocument[],
  knownPaths: ReadonlySet<string>,
  includePath: PathInclusion,
  contentRequested: boolean,
): Promise<readonly SpecContextReadDocument[]> {
  const scanText = async (path: string): Promise<string> => {
    const rawBytes = await readContextDocumentBytes(productDir, path);
    // Content mode promises atomic exact-path failure on the first invalid
    // document; without it the scan tolerates lossy decoding.
    return contentRequested ? decodeContextDocumentOrThrow(path, rawBytes) : rawBytes.toString("utf8");
  };
  const citersByPath = new Map<string, string[]>();
  const queue: string[] = [];
  const collectCitations = (citingPath: string, text: string): void => {
    for (const citedPath of extractDecisionCitations(text)) {
      if (knownPaths.has(citedPath)) continue;
      const citers = citersByPath.get(citedPath);
      if (citers !== undefined) {
        if (!citers.includes(citingPath)) citers.push(citingPath);
        continue;
      }
      citersByPath.set(citedPath, [citingPath]);
      queue.push(citedPath);
    }
  };
  for (const source of sources) {
    collectCitations(source.path, await scanText(source.path));
  }
  const resolutionOrder: string[] = [];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const citers = citersByPath.get(next) ?? [];
    if (await optionalSpecTreeFile(productDir, next, includePath) === undefined) {
      throw new Error(formatMissingCitedDecisionError(next, citers[0]));
    }
    collectCitations(next, await scanText(next));
    resolutionOrder.push(next);
  }
  return resolutionOrder.map((path) => ({
    role: SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
    path,
    citedBy: citersByPath.get(path),
  }));
}

/**
 * Local overlay paths in lexicographic order — from the tracked-path set when
 * git scoping is available, else from the overlay directory listing.
 */
async function localOverlayPaths(
  productDir: string,
  trackedPaths: ReadonlySet<string> | undefined,
): Promise<readonly string[]> {
  if (trackedPaths !== undefined) {
    return [...trackedPaths].filter((path) => isLocalOverlayPath(path)).sort((left, right) =>
      left.localeCompare(right)
    );
  }
  let entries: readonly string[];
  try {
    entries = await readdir(join(productDir, SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY));
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => childSpecPath(SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY, name));
}

/**
 * Attaches each read document's exact UTF-8 content, raw-byte digest, and byte
 * count. The digest hashes the raw bytes before decoding; the first unreadable
 * or non-UTF-8 document aborts the whole projection naming its exact path.
 */
async function withDocumentContent(
  productDir: string,
  read: readonly SpecContextReadDocument[],
): Promise<readonly SpecContextReadDocument[]> {
  const enriched: SpecContextReadDocument[] = [];
  for (const document of read) {
    const rawBytes = await readContextDocumentBytes(productDir, document.path);
    enriched.push({
      ...document,
      content: decodeContextDocumentOrThrow(document.path, rawBytes),
      digest: specContextDigest(rawBytes),
      bytes: rawBytes.byteLength,
    });
  }
  return enriched;
}

async function buildManifest(
  productDir: string,
  snapshot: SpecTreeSnapshot,
  target: SpecTreeNode,
  includePath: PathInclusion,
  trackedPaths: ReadonlySet<string> | undefined,
  contentRequested: boolean,
): Promise<SpecContextManifest> {
  const ancestors = ancestorsFor(snapshot, target);
  const contextNodes = [...ancestors, target];
  const siblings = siblingsFor(snapshot, target);
  const lowerSiblings = lowerIndexSiblingsForContextNodes(snapshot, contextNodes);
  const sameIndex = sortPaths(
    siblings.filter((node) => node.order === target.order).map((node) => fullSpecPath(node.id)),
  );
  const higherIndex = sortPaths(
    siblings.filter((node) => node.order > target.order).map((node) => fullSpecPath(node.id)),
  );
  const methodologyConfig = await resolveMethodologyConfig(productDir);
  if (!methodologyConfig.ok) {
    throw new Error(methodologyConfig.error);
  }
  const methodology = resolveMethodologyIdentity(methodologyConfig.value);

  const read: SpecContextReadDocument[] = [];
  await pushExistingReadDocument(
    read,
    SPEC_CONTEXT_READ_ROLE.PRODUCT,
    productDir,
    refPath(snapshot.product?.ref),
    includePath,
  );
  for (const ancestor of ancestors) {
    await pushExistingReadDocument(
      read,
      SPEC_CONTEXT_READ_ROLE.ANCESTOR,
      productDir,
      refPath(ancestor.ref),
      includePath,
    );
  }
  await pushExistingReadDocument(
    read,
    SPEC_CONTEXT_READ_ROLE.TARGET,
    productDir,
    refPath(target.ref),
    includePath,
  );
  for (const decision of decisionsFor(snapshot, contextNodes)) {
    await pushExistingReadDocument(
      read,
      SPEC_CONTEXT_READ_ROLE.DECISION,
      productDir,
      refPath(decision.ref),
      includePath,
    );
  }
  for (const sibling of lowerSiblings) {
    await pushExistingReadDocument(
      read,
      SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING,
      productDir,
      refPath(sibling.ref),
      includePath,
    );
  }
  const structuralDocuments = [...read];
  await pushCoordinationDocuments(read, productDir, contextNodes, includePath);
  await pushGuideDocuments(read, productDir, contextNodes, includePath);
  const knownPaths = new Set(read.map((document) => document.path));
  read.push(
    ...await citedDecisionDocuments(productDir, structuralDocuments, knownPaths, includePath, contentRequested),
  );
  const overlayPaths = await localOverlayPaths(productDir, trackedPaths);
  await pushExistingReadDocument(
    read,
    SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY,
    productDir,
    overlayPaths.includes(SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH) ? SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH : undefined,
    includePath,
  );

  const listed: SpecContextListedEntry[] = [];
  for (const evidence of evidenceFor(snapshot, target)) {
    await pushExistingListedEntry(
      listed,
      SPEC_CONTEXT_LISTED_ROLE.EVIDENCE,
      productDir,
      refPath(evidence.ref),
      includePath,
    );
  }
  for (const overlayPath of overlayPaths) {
    if (overlayPath === SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH) continue;
    await pushExistingListedEntry(
      listed,
      SPEC_CONTEXT_LISTED_ROLE.OVERLAY,
      productDir,
      overlayPath,
      includePath,
    );
  }
  for (const sibling of sameIndex) {
    listed.push({ role: SPEC_CONTEXT_LISTED_ROLE.SAME_INDEX_SIBLING, path: sibling });
  }
  for (const sibling of higherIndex) {
    listed.push({ role: SPEC_CONTEXT_LISTED_ROLE.HIGHER_INDEX_SIBLING, path: sibling });
  }

  return {
    schemaVersion: SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
    methodology,
    productDir,
    target: fullSpecPath(target.id),
    bootstrap: specContextBootstrap(snapshot.allNodes.length),
    read: contentRequested ? await withDocumentContent(productDir, read) : read,
    listed,
  };
}

export async function resolveContextManifest(options: ContextOptions): Promise<SpecContextManifestResolution> {
  const gitDependencies = options.gitDependencies ?? defaultGitDependencies;
  const productDir = await resolveSpecProductDir(
    options.cwd ?? CONFIG_PROCESS_CWD.read(),
    gitDependencies,
    options.onWarning,
  );
  const trackedPaths = await listTrackedPaths(productDir, gitDependencies);
  const includePath = createTrackedPathInclusion(trackedPaths);
  const snapshot = await readSpecTree({
    source: createFilesystemSpecTreeSource({
      productDir,
      includePath,
    }),
  });
  const resolution = resolveSpecContextTarget(snapshot, options.target);
  if (!resolution.ok) return resolution;
  return {
    manifest: await buildManifest(
      productDir,
      snapshot,
      resolution.node,
      includePath,
      trackedPaths,
      options.content === true,
    ),
    ok: true,
  };
}

function appendList(lines: string[], label: string, values: readonly string[]): void {
  lines.push(`${label}:`);
  for (const value of values) {
    lines.push(`${TEXT_LIST_INDENT}${value}`);
  }
}

function renderReadDocument(document: SpecContextReadDocument): string {
  const provenance = document.citedBy === undefined ? "" : ` (cited by ${document.citedBy.join(", ")})`;
  return `${document.role}: ${document.path}${provenance}`;
}

export function renderSpecContextText(manifest: SpecContextManifest): string {
  const lines = [
    `${SPEC_CONTEXT_TEXT_LABEL.TARGET}: ${manifest.target}`,
    `${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${manifest.productDir}`,
    `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${manifest.methodology.source}@${manifest.methodology.version}`,
    `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${manifest.schemaVersion}`,
    `${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: ${manifest.bootstrap}`,
  ];
  appendList(lines, SPEC_CONTEXT_TEXT_LABEL.READ, manifest.read.map(renderReadDocument));
  appendList(
    lines,
    SPEC_CONTEXT_TEXT_LABEL.LISTED,
    manifest.listed.map((entry) => `${entry.role}: ${entry.path}`),
  );
  return lines.join("\n");
}

export function renderSpecContextJson(manifest: SpecContextManifest): string {
  return JSON.stringify(manifest, null, JSON_INDENTATION);
}
