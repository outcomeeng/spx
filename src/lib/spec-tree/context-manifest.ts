/**
 * Pure vocabulary and computation for the spec context manifest: entry-class
 * role registries, the read-class group order, the schema-version-2 bundle
 * shape, per-target read-set composition into one deduplicated bundle,
 * citation extraction from document text, content digest and decoding
 * primitives, and the exact-path diagnostics.
 *
 * Filesystem and git reads stay in the command handler; every function here is
 * a pure function over supplied inputs.
 *
 * @module lib/spec-tree/context-manifest
 */

import { createHash } from "node:crypto";

import type { MethodologyIdentity } from "@/config/methodology";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "./config";

/** Manifest schema version; changes exactly when the manifest shape changes incompatibly. */
export const SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION = 2;

/** Roles whose entries a consumer reads; the read class. */
export const SPEC_CONTEXT_READ_ROLE = {
  PRODUCT: "product",
  ANCESTOR: "ancestor",
  TARGET: "target",
  DECISION: "decision",
  LOWER_INDEX_SIBLING: "lower-index-sibling",
  COORDINATION: "coordination",
  CITED_DECISION: "cited-decision",
  LIFECYCLE_OVERLAY: "lifecycle-overlay",
  METHODOLOGY: "methodology",
} as const;

export type SpecContextReadRole = (typeof SPEC_CONTEXT_READ_ROLE)[keyof typeof SPEC_CONTEXT_READ_ROLE];

/** Total group order of the read class; each target's read sequence is ordered by these groups. */
export const SPEC_CONTEXT_READ_ROLE_ORDER: readonly SpecContextReadRole[] = [
  SPEC_CONTEXT_READ_ROLE.PRODUCT,
  SPEC_CONTEXT_READ_ROLE.ANCESTOR,
  SPEC_CONTEXT_READ_ROLE.TARGET,
  SPEC_CONTEXT_READ_ROLE.DECISION,
  SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING,
  SPEC_CONTEXT_READ_ROLE.COORDINATION,
  SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
  SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY,
  SPEC_CONTEXT_READ_ROLE.METHODOLOGY,
] as const;

/** Roles whose entries the manifest names without a read obligation; the listed class. */
export const SPEC_CONTEXT_LISTED_ROLE = {
  EVIDENCE: "evidence",
  GUIDE: "guide",
  OVERLAY: "overlay",
  SAME_INDEX_SIBLING: "same-index-sibling",
  HIGHER_INDEX_SIBLING: "higher-index-sibling",
  METHODOLOGY_CATALOG: "methodology-catalog",
} as const;

export type SpecContextListedRole = (typeof SPEC_CONTEXT_LISTED_ROLE)[keyof typeof SPEC_CONTEXT_LISTED_ROLE];

/** Directory holding product-local skill overlays, projected from the grammar relative to the product root. */
export const SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY =
  `${SPEC_TREE_CONFIG.ROOT_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.DIRECTORY_NAME}`;

/** Full path of the one overlay with a read obligation — the merge-lifecycle overlay — projected from the grammar. */
export const SPEC_CONTEXT_LIFECYCLE_OVERLAY_PATH =
  `${SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}${SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.LIFECYCLE_FILENAME}`;

/** Whether `path` names a local overlay: a markdown file directly inside the overlay directory. */
export function isLocalOverlayPath(path: string): boolean {
  const prefix = `${SPEC_CONTEXT_LOCAL_OVERLAY_DIRECTORY}${SPEC_TREE_GRAMMAR.PATH_SEPARATOR}`;
  if (!path.startsWith(prefix) || !path.endsWith(SPEC_TREE_GRAMMAR.LOCAL_OVERLAYS.EXTENSION)) return false;
  return !path.slice(prefix.length).includes(SPEC_TREE_GRAMMAR.PATH_SEPARATOR);
}

/** One target's role claim on a read document. */
export interface SpecContextRoleBinding {
  readonly target: string;
  readonly role: SpecContextReadRole;
}

/** One target's role claim on a listed entry. */
export interface SpecContextListedRoleBinding {
  readonly target: string;
  readonly role: SpecContextListedRole;
}

export interface SpecContextReadDocument {
  readonly path: string;
  /** Every target-role pair this document holds across the requested target set. */
  readonly roles: readonly SpecContextRoleBinding[];
  /** Present only on cited-decision entries: the read-class documents citing this decision, in read order. */
  readonly citedBy?: readonly string[];
  /** The document's exact UTF-8 text: always on methodology entries, otherwise only when content is requested. */
  readonly content?: string;
  /** The raw-byte digest, prefixed with its algorithm: always on methodology entries, otherwise only when content is requested. */
  readonly digest?: string;
  /** The document's raw byte count: always on methodology entries, otherwise only when content is requested. */
  readonly bytes?: number;
}

export interface SpecContextListedEntry {
  readonly path: string;
  /** Every target-role pair this entry holds across the requested target set. */
  readonly roles: readonly SpecContextListedRoleBinding[];
}

/** One target's ordered read and listed sequences as path references into the deduplicated entry lists. */
export interface SpecContextTargetCoverage {
  readonly target: string;
  readonly read: readonly string[];
  readonly listed: readonly string[];
}

export interface SpecContextManifest {
  readonly schemaVersion: number;
  readonly methodology: MethodologyIdentity;
  readonly productDir: string;
  readonly targets: readonly string[];
  readonly bootstrap: boolean;
  readonly read: readonly SpecContextReadDocument[];
  readonly listed: readonly SpecContextListedEntry[];
  readonly coverage: readonly SpecContextTargetCoverage[];
}

export type SpecContextManifestProjection = Omit<SpecContextManifest, "bootstrap"> & {
  readonly nodeCount: number;
};

/** One document in a single target's ordered read sequence, before bundle composition. */
export interface SpecContextTargetReadDocument {
  readonly role: SpecContextReadRole;
  readonly path: string;
  readonly citedBy?: readonly string[];
}

/** One entry in a single target's listed sequence, before bundle composition. */
export interface SpecContextTargetListedEntry {
  readonly role: SpecContextListedRole;
  readonly path: string;
}

/** One resolved target's complete read and listed sequences in that target's group order. */
export interface SpecContextTargetReadSet {
  readonly target: string;
  readonly read: readonly SpecContextTargetReadDocument[];
  readonly listed: readonly SpecContextTargetListedEntry[];
}

export interface SpecContextBundle {
  readonly targets: readonly string[];
  readonly read: readonly SpecContextReadDocument[];
  readonly listed: readonly SpecContextListedEntry[];
  readonly coverage: readonly SpecContextTargetCoverage[];
}

type MergedReadDocument = {
  readonly roles: SpecContextRoleBinding[];
  citedBy: string[] | undefined;
};

function mergeReadDocument(
  merged: Map<string, MergedReadDocument>,
  target: string,
  document: SpecContextTargetReadDocument,
): void {
  const existing = merged.get(document.path);
  if (existing === undefined) {
    merged.set(document.path, {
      roles: [{ target, role: document.role }],
      citedBy: document.citedBy === undefined ? undefined : [...document.citedBy],
    });
    return;
  }
  if (!existing.roles.some((binding) => binding.target === target && binding.role === document.role)) {
    existing.roles.push({ target, role: document.role });
  }
  for (const citer of document.citedBy ?? []) {
    existing.citedBy = existing.citedBy ?? [];
    if (!existing.citedBy.includes(citer)) existing.citedBy.push(citer);
  }
}

function mergeListedEntry(
  merged: Map<string, SpecContextListedRoleBinding[]>,
  target: string,
  entry: SpecContextTargetListedEntry,
): void {
  const existing = merged.get(entry.path);
  if (existing === undefined) {
    merged.set(entry.path, [{ target, role: entry.role }]);
    return;
  }
  if (!existing.some((binding) => binding.target === target && binding.role === entry.role)) {
    existing.push({ target, role: entry.role });
  }
}

/**
 * Composes per-target read sets into one deduplicated bundle. The resolved
 * target set is canonically ordered by ordinal identity comparison before
 * composition, so every permutation of the same operands yields byte-identical
 * output. Each shared document appears exactly once, carrying every
 * target-role pair it holds and the union of its citing paths in
 * first-appearance order; per-target coverage keeps each target's own ordered
 * sequences reconstructible by path reference.
 */
export function composeSpecContextBundle(sets: readonly SpecContextTargetReadSet[]): SpecContextBundle {
  const orderedSets = [...sets].sort((left, right) => compareSpecContextOrdinal(left.target, right.target));
  // Map insertion order is the first-appearance composition order, so the
  // deduplicated arrays project straight from the merge maps.
  const readByPath = new Map<string, MergedReadDocument>();
  const listedByPath = new Map<string, SpecContextListedRoleBinding[]>();
  for (const set of orderedSets) {
    for (const document of set.read) {
      mergeReadDocument(readByPath, set.target, document);
    }
    for (const entry of set.listed) {
      mergeListedEntry(listedByPath, set.target, entry);
    }
  }
  return {
    targets: orderedSets.map((set) => set.target),
    read: [...readByPath.entries()].map(([path, merged]) => ({
      path,
      roles: merged.roles,
      ...(merged.citedBy === undefined ? {} : { citedBy: merged.citedBy }),
    })),
    listed: [...listedByPath.entries()].map(([path, roles]) => ({ path, roles })),
    coverage: orderedSets.map((set) => ({
      target: set.target,
      read: set.read.map((document) => document.path),
      listed: set.listed.map((entry) => entry.path),
    })),
  };
}

/**
 * Full-path decision citations: a `spx/`-rooted path ending in `.adr.md` or
 * `.pdr.md`. The character class cannot cross whitespace, brackets,
 * parentheses, or backticks, so markdown link syntax never bleeds into a
 * match; the boundary assertions reject shapes that continue past the
 * decision suffix (`….adr.mdx`, `….adr.md.bak`) or embed `spx/` inside a
 * longer path, so only a complete tree-rooted decision path binds.
 */
const DECISION_CITATION_PATTERN = /(?<![A-Za-z0-9._/-])spx\/[A-Za-z0-9._/-]+\.(?:adr|pdr)\.md(?![A-Za-z0-9._/-])/g;

/**
 * A citation binds only through a canonical tree path: every segment is a real
 * directory or file name, so relative segments never reach the filesystem.
 */
function hasRelativePathSegment(path: string): boolean {
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

/** Unique full-path decision citations in `text`, in first-appearance order; relative-segment shapes bind nothing. */
export function extractDecisionCitations(text: string): readonly string[] {
  const seen = new Set<string>();
  const citations: string[] = [];
  for (const match of text.matchAll(DECISION_CITATION_PATTERN)) {
    if (seen.has(match[0]) || hasRelativePathSegment(match[0])) continue;
    seen.add(match[0]);
    citations.push(match[0]);
  }
  return citations;
}

/** Diagnostic for a citation whose decision file no tracked path satisfies; names both exact paths. */
export function formatMissingCitedDecisionError(citedPath: string, citingPath: string): string {
  return `Spec context cited decision not found: ${citedPath} (cited by ${citingPath})`;
}

/** Snapshot-derived bootstrap state: a tree with no nodes is in bootstrap. */
export function specContextBootstrap(nodeCount: number): boolean {
  return nodeCount === 0;
}

/** Projects the emitted manifest shape from snapshot cardinality and the assembled context fields. */
export function projectSpecContextManifest(
  projection: SpecContextManifestProjection,
): SpecContextManifest {
  const { nodeCount, ...manifest } = projection;
  return { ...manifest, bootstrap: specContextBootstrap(nodeCount) };
}

/**
 * Ordinal code-unit comparison for every intra-group ordering rule in the
 * manifest. A locale-aware comparator would vary with the host locale and ICU
 * build, breaking the schema decision's byte-identical projection invariant.
 */
export function compareSpecContextOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Field names of the opt-in content attachment on read documents; schema vocabulary consumers key on. */
export const SPEC_CONTEXT_CONTENT_FIELDS = {
  CONTENT: "content",
  DIGEST: "digest",
  BYTES: "bytes",
} as const;

/** Hash algorithm that names every content digest. */
export const SPEC_CONTEXT_DIGEST_ALGORITHM = "sha256";

/** Digest of a document's raw bytes, computed before any text decoding, prefixed with its algorithm. */
export function specContextDigest(rawBytes: Uint8Array): string {
  return `${SPEC_CONTEXT_DIGEST_ALGORITHM}:${createHash(SPEC_CONTEXT_DIGEST_ALGORITHM).update(rawBytes).digest("hex")}`;
}

/**
 * Decodes raw document bytes as strict UTF-8; any invalid sequence throws.
 * A leading byte-order mark stays in the decoded text so the content
 * round-trips to the raw-byte digest and byte count.
 */
export function decodeContextDocumentUtf8(rawBytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(rawBytes);
}

/** Diagnostic for a read document whose bytes are not valid UTF-8; names the exact path. */
export function formatInvalidContextDocumentError(path: string): string {
  return `Spec context document is not valid UTF-8: ${path}`;
}

/** Diagnostic for a read document that cannot be read; names the exact path. */
export function formatUnreadableContextDocumentError(path: string): string {
  return `Spec context document unreadable: ${path}`;
}
