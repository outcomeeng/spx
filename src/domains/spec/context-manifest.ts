/**
 * Pure vocabulary and computation for the spec context manifest: entry-class
 * role registries, the read-class group order, the manifest shape, citation
 * extraction from document text, content digest and decoding primitives, and
 * the exact-path diagnostics.
 *
 * Filesystem and git reads stay in the command handler; every function here is
 * a pure function over supplied inputs.
 *
 * @module domains/spec/context-manifest
 */

import { createHash } from "node:crypto";

import type { MethodologyIdentity } from "@/config/methodology";
import { SPEC_TREE_CONFIG, SPEC_TREE_GRAMMAR } from "@/lib/spec-tree/config";

/** Manifest schema version; changes exactly when the manifest shape changes incompatibly. */
export const SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION = 1;

/** Roles whose entries a consumer reads; the read class. */
export const SPEC_CONTEXT_READ_ROLE = {
  PRODUCT: "product",
  ANCESTOR: "ancestor",
  TARGET: "target",
  DECISION: "decision",
  LOWER_INDEX_SIBLING: "lower-index-sibling",
  COORDINATION: "coordination",
  GUIDE: "guide",
  CITED_DECISION: "cited-decision",
  LIFECYCLE_OVERLAY: "lifecycle-overlay",
} as const;

export type SpecContextReadRole = (typeof SPEC_CONTEXT_READ_ROLE)[keyof typeof SPEC_CONTEXT_READ_ROLE];

/** Total group order of the read class; the manifest's read array is ordered by these groups. */
export const SPEC_CONTEXT_READ_ROLE_ORDER: readonly SpecContextReadRole[] = [
  SPEC_CONTEXT_READ_ROLE.PRODUCT,
  SPEC_CONTEXT_READ_ROLE.ANCESTOR,
  SPEC_CONTEXT_READ_ROLE.TARGET,
  SPEC_CONTEXT_READ_ROLE.DECISION,
  SPEC_CONTEXT_READ_ROLE.LOWER_INDEX_SIBLING,
  SPEC_CONTEXT_READ_ROLE.COORDINATION,
  SPEC_CONTEXT_READ_ROLE.GUIDE,
  SPEC_CONTEXT_READ_ROLE.CITED_DECISION,
  SPEC_CONTEXT_READ_ROLE.LIFECYCLE_OVERLAY,
];

/** Roles whose entries the manifest names without a read obligation; the listed class. */
export const SPEC_CONTEXT_LISTED_ROLE = {
  EVIDENCE: "evidence",
  OVERLAY: "overlay",
  SAME_INDEX_SIBLING: "same-index-sibling",
  HIGHER_INDEX_SIBLING: "higher-index-sibling",
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

export interface SpecContextReadDocument {
  readonly role: SpecContextReadRole;
  readonly path: string;
  /** Present only on cited-decision entries: the read-class documents citing this decision, in read order. */
  readonly citedBy?: readonly string[];
  /** Present only when document content is requested: the document's exact UTF-8 text. */
  readonly content?: string;
  /** Present only when document content is requested: the raw-byte digest, prefixed with its algorithm. */
  readonly digest?: string;
  /** Present only when document content is requested: the document's raw byte count. */
  readonly bytes?: number;
}

export interface SpecContextListedEntry {
  readonly role: SpecContextListedRole;
  readonly path: string;
}

export interface SpecContextManifest {
  readonly schemaVersion: number;
  readonly methodology: MethodologyIdentity;
  readonly productDir: string;
  readonly target: string;
  readonly bootstrap: boolean;
  readonly read: readonly SpecContextReadDocument[];
  readonly listed: readonly SpecContextListedEntry[];
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
