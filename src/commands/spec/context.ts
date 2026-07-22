import { readdir, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION, resolveMethodologyIdentity } from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
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
  formatFoundationManifestInvalidError,
  formatFoundationManifestUnreadableError,
  formatFoundationPackageUnconfiguredError,
  formatFoundationResourceUnreadableError,
  FOUNDATION_MANIFEST_RELATIVE_PATH,
  foundationCatalogPaths,
  parseFoundationResourceManifest,
} from "@/lib/methodology/foundation-manifest";
import {
  compareSpecContextOrdinal,
  composeSpecContextBundle,
  createFilesystemSpecTreeSource,
  decodeContextDocumentUtf8,
  extractDecisionCitations,
  formatInvalidContextDocumentError,
  formatMissingCitedDecisionError,
  formatUnreadableContextDocumentError,
  isLocalOverlayPath,
  readSpecTree,
  resolveSpecContextTarget,
  SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH,
  SPEC_CONTEXT_LISTED_ROLE,
  SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY,
  SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
  SPEC_CONTEXT_READ_ROLE,
  SPEC_TREE_CONFIG,
  SPEC_TREE_GRAMMAR,
  specContextAncestors,
  specContextBootstrap,
  specContextDecisions,
  specContextDigest,
  specContextEvidence,
  specContextLowerIndexSiblings,
  type SpecContextManifest,
  type SpecContextReadDocument,
  specContextSiblings,
  type SpecContextTargetFailure,
  type SpecContextTargetListedEntry,
  type SpecContextTargetReadDocument,
  type SpecContextTargetReadSet,
  type SpecTreeNode,
  type SpecTreeSnapshot,
  type SpecTreeSourceRef,
} from "@/lib/spec-tree";
import { resolveSpecProductDir, type SpecProductDirWarningHandler } from "./root";

export type SpecContextManifestResolution =
  | { readonly ok: true; readonly manifest: SpecContextManifest }
  | { readonly ok: false; readonly failure: SpecContextTargetFailure };

export interface ContextOptions {
  readonly targets: readonly string[];
  readonly cwd?: string;
  /** When true, every read-class entry carries the document's exact content, digest, and byte count. */
  readonly content?: boolean;
  /** When true, the manifest carries the foundation methodology payload from the installed package. */
  readonly understand?: boolean;
  readonly gitDependencies?: GitDependencies;
  readonly onWarning?: SpecProductDirWarningHandler;
}

const JSON_INDENTATION = 2;
const SPEC_TREE_ROOT_PREFIX = `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/`;

export const SPEC_CONTEXT_TEXT_LABEL = {
  TARGETS: "Targets",
  PRODUCT_ROOT: "Product root",
  METHODOLOGY: "Methodology",
  SCHEMA_VERSION: "Schema version",
  BOOTSTRAP: "Bootstrap",
  READ: "Read",
  LISTED: "Listed",
  METHODOLOGY_DOCUMENT: "Methodology document",
} as const;

const TEXT_LIST_INDENT = "  - ";

type PathInclusion = (path: string) => boolean | Promise<boolean>;

function refPath(ref: SpecTreeSourceRef | undefined): string | undefined {
  return ref?.path;
}

function sortPaths(paths: readonly string[]): readonly string[] {
  return [...paths].sort(compareSpecContextOrdinal);
}

function fullSpecPath(path: string): string {
  return path.startsWith(SPEC_TREE_ROOT_PREFIX) ? path : `${SPEC_TREE_ROOT_PREFIX}${path}`;
}

function childSpecPath(parent: string, child: string): string {
  return `${parent}${TRACKED_PATH_DIRECTORY_SEPARATOR}${child}`;
}

async function pushExistingReadDocument(
  read: SpecContextTargetReadDocument[],
  role: SpecContextTargetReadDocument["role"],
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
  listed: SpecContextTargetListedEntry[],
  role: SpecContextTargetListedEntry["role"],
  productDir: string,
  path: string | undefined,
  includePath: PathInclusion,
): Promise<void> {
  if (path === undefined || !await optionalSpecTreeFile(productDir, path, includePath)) {
    return;
  }
  listed.push({ role, path });
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
  read: SpecContextTargetReadDocument[],
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

async function pushGuideEntries(
  listed: SpecContextTargetListedEntry[],
  productDir: string,
  contextNodes: readonly SpecTreeNode[],
  includePath: PathInclusion,
): Promise<void> {
  const directories = ["", ...contextNodes.map((node) => fullSpecPath(node.id))];
  for (const directory of directories) {
    for (const filename of SPEC_TREE_GRAMMAR.GUIDE_FILES) {
      await pushExistingListedEntry(
        listed,
        SPEC_CONTEXT_LISTED_ROLE.GUIDE,
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
 * Bytes and decoded text the citation scan already read, keyed by tree path.
 * The cache spans the whole invocation so a document shared across targets is
 * read from disk once, and in content mode the attachment step reuses the
 * strictly decoded entries instead of reading each document twice.
 */
type ScannedDocuments = Map<string, { readonly rawBytes: Buffer; readonly content: string }>;

/**
 * Resolves full-path decision citations from the structural spec and decision
 * documents, transitively through cited decisions, preserving citing-file
 * provenance. A citation whose decision file is absent from the tracked tree
 * fails the projection naming both exact paths. In content mode every scanned
 * document's bytes and decoded text are recorded in `scannedDocuments`, so
 * content attachment reuses them instead of reading each document twice.
 */
async function citedDecisionDocuments(
  productDir: string,
  sources: readonly SpecContextTargetReadDocument[],
  knownPaths: ReadonlySet<string>,
  includePath: PathInclusion,
  contentRequested: boolean,
  scannedDocuments: ScannedDocuments,
): Promise<readonly SpecContextTargetReadDocument[]> {
  // Content mode promises atomic exact-path failure on the first unreadable
  // or invalid document; the path-only projection carries no such contract,
  // so there an unscannable document simply contributes no citations.
  const scanText = async (path: string): Promise<string | undefined> => {
    const scanned = scannedDocuments.get(path);
    if (scanned !== undefined) return scanned.content;
    let rawBytes: Buffer;
    try {
      rawBytes = await readContextDocumentBytes(productDir, path);
    } catch (error) {
      if (contentRequested) throw error;
      return undefined;
    }
    const content = contentRequested
      ? decodeContextDocumentOrThrow(path, rawBytes)
      : rawBytes.toString("utf8");
    scannedDocuments.set(path, { rawBytes, content });
    return content;
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
    const text = await scanText(source.path);
    if (text !== undefined) collectCitations(source.path, text);
  }
  const resolutionOrder: string[] = [];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const citers = citersByPath.get(next) ?? [];
    if (await optionalSpecTreeFile(productDir, next, includePath) === undefined) {
      throw new Error(formatMissingCitedDecisionError(next, citers[0]));
    }
    const text = await scanText(next);
    if (text !== undefined) collectCitations(next, text);
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
    return [...trackedPaths].filter((path) => isLocalOverlayPath(path)).sort(compareSpecContextOrdinal);
  }
  let entries: readonly string[];
  try {
    entries = await readdir(join(productDir, SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY));
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith(SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION))
    .sort(compareSpecContextOrdinal)
    .map((name) => childSpecPath(SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY, name));
}

/** One resolved target's complete read and listed sequences in that target's group order. */
async function buildTargetReadSet(
  productDir: string,
  snapshot: SpecTreeSnapshot,
  target: SpecTreeNode,
  includePath: PathInclusion,
  trackedPaths: ReadonlySet<string> | undefined,
  contentRequested: boolean,
  scannedDocuments: ScannedDocuments,
): Promise<SpecContextTargetReadSet> {
  const ancestors = specContextAncestors(snapshot, target);
  const contextNodes = [...ancestors, target];
  const siblings = specContextSiblings(snapshot, target);
  const lowerSiblings = specContextLowerIndexSiblings(snapshot, contextNodes);
  const sameIndex = sortPaths(
    siblings.filter((node) => node.order === target.order).map((node) => fullSpecPath(node.id)),
  );
  const higherIndex = sortPaths(
    siblings.filter((node) => node.order > target.order).map((node) => fullSpecPath(node.id)),
  );

  const read: SpecContextTargetReadDocument[] = [];
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
  for (const decision of specContextDecisions(snapshot, contextNodes)) {
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
  const knownPaths = new Set(read.map((document) => document.path));
  read.push(
    ...await citedDecisionDocuments(
      productDir,
      structuralDocuments,
      knownPaths,
      includePath,
      contentRequested,
      scannedDocuments,
    ),
  );
  const overlayPaths = await localOverlayPaths(productDir, trackedPaths);
  await pushExistingReadDocument(
    read,
    SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY,
    productDir,
    overlayPaths.includes(SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH) ? SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH : undefined,
    includePath,
  );

  const listed: SpecContextTargetListedEntry[] = [];
  for (const evidence of specContextEvidence(snapshot, target)) {
    await pushExistingListedEntry(
      listed,
      SPEC_CONTEXT_LISTED_ROLE.EVIDENCE,
      productDir,
      refPath(evidence.ref),
      includePath,
    );
  }
  await pushGuideEntries(listed, productDir, contextNodes, includePath);
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

  return { target: fullSpecPath(target.id), read, listed };
}

/**
 * Attaches each read document's exact UTF-8 content, raw-byte digest, and byte
 * count, reusing bytes the citation scan already read so each document is read
 * once per projection. The digest hashes the raw bytes before decoding; the
 * first unreadable or non-UTF-8 document aborts the whole projection naming
 * its exact path. Methodology entries already carry their bodies and pass
 * through unchanged.
 */
async function withDocumentContent(
  productDir: string,
  read: readonly SpecContextReadDocument[],
  scannedDocuments: ScannedDocuments,
): Promise<readonly SpecContextReadDocument[]> {
  const enriched: SpecContextReadDocument[] = [];
  for (const document of read) {
    if (document.content !== undefined) {
      enriched.push(document);
      continue;
    }
    const scanned = scannedDocuments.get(document.path);
    const rawBytes = scanned?.rawBytes ?? await readContextDocumentBytes(productDir, document.path);
    enriched.push({
      ...document,
      content: scanned?.content ?? decodeContextDocumentOrThrow(document.path, rawBytes),
      digest: specContextDigest(rawBytes),
      bytes: rawBytes.byteLength,
    });
  }
  return enriched;
}

/** The methodology payload read from the installed package: the core body plus the catalog paths. */
interface MethodologyPayload {
  readonly core: SpecContextReadDocument;
  readonly catalog: readonly string[];
}

/**
 * Reads the foundation-resource manifest and the core foundation body from the
 * configured installed methodology package. An unconfigured location, an
 * absent or invalid manifest, an unrecognized schema version, or an unreadable
 * named resource fails the whole projection naming the resolved path.
 */
async function readMethodologyPayload(
  productDir: string,
  packageDir: string | undefined,
  targets: readonly string[],
): Promise<MethodologyPayload> {
  if (packageDir === undefined) {
    throw new Error(
      formatFoundationPackageUnconfiguredError(METHODOLOGY_SECTION, METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR),
    );
  }
  const resolvedPackageDir = resolve(productDir, packageDir);
  const manifestPath = join(resolvedPackageDir, FOUNDATION_MANIFEST_RELATIVE_PATH);
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch {
    throw new Error(formatFoundationManifestUnreadableError(manifestPath));
  }
  const manifest = parseFoundationResourceManifest(manifestText);
  if (!manifest.ok) {
    throw new Error(formatFoundationManifestInvalidError(manifestPath, manifest.error));
  }
  // The manifest is validated data, not a trusted read authority: the core
  // path binds a read only when it resolves — through any symbolic link —
  // inside the installed package location, the same containment every
  // product-document read gets from the product root.
  const corePath = await containedDocumentPath(resolvedPackageDir, manifest.value.core);
  if (corePath === undefined) {
    throw new Error(formatFoundationResourceUnreadableError(manifest.value.core, manifestPath));
  }
  let coreBytes: Buffer;
  try {
    coreBytes = await readFile(corePath);
  } catch {
    throw new Error(formatFoundationResourceUnreadableError(manifest.value.core, manifestPath));
  }
  return {
    core: {
      path: manifest.value.core,
      roles: targets.map((target) => ({ target, role: SPEC_CONTEXT_READ_ROLE.METHODOLOGY })),
      content: decodeContextDocumentOrThrow(manifest.value.core, coreBytes),
      digest: specContextDigest(coreBytes),
      bytes: coreBytes.byteLength,
    },
    catalog: foundationCatalogPaths(manifest.value),
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
  const resolvedTargets: SpecTreeNode[] = [];
  for (const target of options.targets) {
    const resolution = resolveSpecContextTarget(snapshot, target);
    if (!resolution.ok) return resolution;
    resolvedTargets.push(resolution.node);
  }
  const methodologyConfig = await resolveMethodologyConfig(productDir);
  if (!methodologyConfig.ok) {
    throw new Error(methodologyConfig.error);
  }
  const methodology = resolveMethodologyIdentity(methodologyConfig.value);
  const contentRequested = options.content === true;
  const scannedDocuments: ScannedDocuments = new Map();
  const uniqueTargets = new Map<string, SpecTreeNode>(
    resolvedTargets.map((node) => [fullSpecPath(node.id), node]),
  );
  const sets: SpecContextTargetReadSet[] = [];
  for (const node of uniqueTargets.values()) {
    sets.push(
      await buildTargetReadSet(
        productDir,
        snapshot,
        node,
        includePath,
        trackedPaths,
        contentRequested,
        scannedDocuments,
      ),
    );
  }
  const bundle = composeSpecContextBundle(sets);
  let read: readonly SpecContextReadDocument[] = bundle.read;
  let listed = bundle.listed;
  let coverage = bundle.coverage;
  if (options.understand === true) {
    const payload = await readMethodologyPayload(productDir, methodologyConfig.value.packageDir, bundle.targets);
    read = [...read, payload.core];
    listed = [
      ...listed,
      ...payload.catalog.map((path) => ({
        path,
        roles: bundle.targets.map((target) => ({
          target,
          role: SPEC_CONTEXT_LISTED_ROLE.METHODOLOGY_CATALOG,
        })),
      })),
    ];
    coverage = coverage.map((targetCoverage) => ({
      target: targetCoverage.target,
      read: [...targetCoverage.read, payload.core.path],
      listed: [...targetCoverage.listed, ...payload.catalog],
    }));
  }
  return {
    manifest: {
      schemaVersion: SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION,
      methodology,
      productDir,
      targets: bundle.targets,
      bootstrap: specContextBootstrap(snapshot.allNodes.length),
      read: contentRequested ? await withDocumentContent(productDir, read, scannedDocuments) : read,
      listed,
      coverage,
    },
    ok: true,
  };
}

function appendList(lines: string[], label: string, values: readonly string[]): void {
  lines.push(`${label}:`);
  for (const value of values) {
    lines.push(`${TEXT_LIST_INDENT}${value}`);
  }
}

function renderRoleBindings(roles: readonly { readonly target: string; readonly role: string }[]): string {
  return roles.map((binding) => `${binding.role}@${binding.target}`).join(", ");
}

function renderReadDocument(document: SpecContextReadDocument): string {
  const provenance = document.citedBy === undefined ? "" : ` (cited by ${document.citedBy.join(", ")})`;
  return `${renderRoleBindings(document.roles)}: ${document.path}${provenance}`;
}

export function renderSpecContextText(manifest: SpecContextManifest): string {
  const lines = [
    `${SPEC_CONTEXT_TEXT_LABEL.TARGETS}: ${manifest.targets.join(", ")}`,
    `${SPEC_CONTEXT_TEXT_LABEL.PRODUCT_ROOT}: ${manifest.productDir}`,
    `${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY}: ${manifest.methodology.source}@${manifest.methodology.version}`,
    `${SPEC_CONTEXT_TEXT_LABEL.SCHEMA_VERSION}: ${manifest.schemaVersion}`,
    `${SPEC_CONTEXT_TEXT_LABEL.BOOTSTRAP}: ${manifest.bootstrap}`,
  ];
  appendList(lines, SPEC_CONTEXT_TEXT_LABEL.READ, manifest.read.map(renderReadDocument));
  appendList(
    lines,
    SPEC_CONTEXT_TEXT_LABEL.LISTED,
    manifest.listed.map((entry) => `${renderRoleBindings(entry.roles)}: ${entry.path}`),
  );
  for (const document of manifest.read) {
    if (
      document.content === undefined
      || !document.roles.some((binding) => binding.role === SPEC_CONTEXT_READ_ROLE.METHODOLOGY)
    ) {
      continue;
    }
    lines.push(`${SPEC_CONTEXT_TEXT_LABEL.METHODOLOGY_DOCUMENT}: ${document.path}`, document.content);
  }
  return lines.join("\n");
}

export function renderSpecContextJson(manifest: SpecContextManifest): string {
  return JSON.stringify(manifest, null, JSON_INDENTATION);
}
