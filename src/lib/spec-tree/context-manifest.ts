/**
 * Pure vocabulary and computation for the spec context manifest: the role
 * registry naming how `show` selects each entry, the schema-version-4 manifest
 * shape, composition of the shared selection's entries into one manifest,
 * document decoding primitives and exact-path diagnostics.
 *
 * Filesystem and git reads stay in the command handler; every function here is
 * a pure function over supplied inputs.
 *
 * @module lib/spec-tree/context-manifest
 */

import type { MethodologyIdentity } from "@/config/methodology";
import { SPEC_TREE_GRAMMAR } from "./config";

/** Manifest schema version; changes exactly when the manifest shape changes incompatibly. */
export const SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION = 4;

/**
 * Every relation through which `show` selects an entry for one target. Each
 * role names exactly one selection mode, so a manifest role states how `show`
 * renders the entry for that target.
 */
export const SPEC_CONTEXT_ROLE = {
  PRODUCT: "product",
  ANCESTOR: "ancestor",
  TARGET: "target",
  DECISION: "decision",
  LOWER_INDEX_SIBLING: "lower-index-sibling",
  SAME_INDEX_SIBLING: "same-index-sibling",
  HIGHER_INDEX_SIBLING: "higher-index-sibling",
  IMMEDIATE_CHILD: "immediate-child",
  OUTCOME_RECORD: "outcome-record",
  KNOWLEDGE_INDEX: "knowledge-index",
  COORDINATION: "coordination",
  CITED_DECISION: "cited-decision",
} as const;

export type SpecContextRole = (typeof SPEC_CONTEXT_ROLE)[keyof typeof SPEC_CONTEXT_ROLE];

/** Total order of the role domain; one entry's bindings for one target follow it. */
export const SPEC_CONTEXT_ROLE_ORDER: readonly SpecContextRole[] = Object.values(SPEC_CONTEXT_ROLE);

/** One target's role claim on a selected entry. */
export interface SpecContextRoleBinding {
  readonly target: string;
  readonly role: SpecContextRole;
}

/** One entry `show` selects, with every target-role pair it holds across the requested target set. */
export interface SpecContextManifestEntry {
  readonly path: string;
  readonly roles: readonly SpecContextRoleBinding[];
  /** Present only on cited-decision entries: every document whose displayed `show` content cites this decision. */
  readonly citedBy?: readonly string[];
}

/** One target's entries as path references into the manifest entry list, in that list's order. */
export interface SpecContextTargetCoverage {
  readonly target: string;
  readonly entries: readonly string[];
}

export interface SpecContextManifest {
  readonly schemaVersion: number;
  readonly methodology: MethodologyIdentity;
  readonly productDir: string;
  readonly targets: readonly string[];
  readonly bootstrap: boolean;
  readonly entries: readonly SpecContextManifestEntry[];
  readonly coverage: readonly SpecContextTargetCoverage[];
}

/** The target-dependent part of a manifest: its canonical target list, entries, and per-target coverage. */
export interface SpecContextManifestSelection {
  readonly targets: readonly string[];
  readonly entries: readonly SpecContextManifestEntry[];
  readonly coverage: readonly SpecContextTargetCoverage[];
}

/** Orders bindings by ordinal target identity, then by the role domain's order. */
export function compareSpecContextRoleBindings(left: SpecContextRoleBinding, right: SpecContextRoleBinding): number {
  return compareSpecContextOrdinal(left.target, right.target)
    || SPEC_CONTEXT_ROLE_ORDER.indexOf(left.role) - SPEC_CONTEXT_ROLE_ORDER.indexOf(right.role);
}

/**
 * Composes the shared selection's entries, in `show` order, into the manifest's
 * target-dependent part. Targets are ordered by ordinal identity and each
 * entry's bindings by target and role, so every permutation of the same
 * operands yields byte-identical output; coverage lists each target's entries
 * in entry order.
 */
export function composeSpecContextManifestSelection(
  targets: readonly string[],
  entries: readonly SpecContextManifestEntry[],
): SpecContextManifestSelection {
  const orderedTargets = [...new Set(targets)].sort(compareSpecContextOrdinal);
  const orderedEntries = entries.map((entry) => ({
    ...entry,
    roles: [...entry.roles].sort(compareSpecContextRoleBindings),
  }));
  return {
    targets: orderedTargets,
    entries: orderedEntries,
    coverage: orderedTargets.map((target) => ({
      target,
      entries: orderedEntries.filter(({ roles }) => roles.some((binding) => binding.target === target))
        .map(({ path }) => path),
    })),
  };
}

/** Snapshot-derived bootstrap state: a tree with no nodes is in bootstrap. */
export function specContextBootstrap(nodeCount: number): boolean {
  return nodeCount === 0;
}

/**
 * Ordinal code-unit comparison for every intra-group ordering rule in the
 * manifest. A locale-aware comparator would vary with the host locale and ICU
 * build, breaking the schema decision's byte-identical projection invariant.
 */
export function compareSpecContextOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * A complete tree-rooted decision path anywhere in a document's text, whether
 * or not a Markdown link carries it. The character class cannot cross
 * whitespace, brackets, parentheses, or backticks, so link syntax never bleeds
 * into a match; the boundary assertions reject shapes that continue past the
 * decision suffix (`….adr.mdx`, `….adr.md.bak`) or embed the root directory
 * inside a longer path, so only a complete tree-rooted decision path binds.
 */
const DECISION_CITATION_PATTERN = /(?<![A-Za-z0-9._/-])spx\/[A-Za-z0-9._/-]+\.(?:adr|pdr)\.md(?![A-Za-z0-9._/-])/g;

/**
 * A citation binds only through a canonical tree path: every segment is a real
 * directory or file name, so relative segments never reach the filesystem.
 */
function hasRelativePathSegment(path: string): boolean {
  return path.split(SPEC_TREE_GRAMMAR.PATH_SEPARATOR).some((segment) => segment === "." || segment === "..");
}

/**
 * Unique full-path decision citations in `text`, in first-appearance order;
 * relative-segment shapes bind nothing. Consumers that select context from a
 * product's own prose — where a decision is as often named in backticks as
 * linked — read citations through this text-shaped discovery; the document
 * projection's link-shaped rule is its own and lives beside that projection.
 */
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

/**
 * Decodes raw document bytes as strict UTF-8; any invalid sequence throws.
 * A leading byte-order mark stays in the decoded text so the content
 * preserves the source bytes.
 */
export function decodeContextDocumentUtf8(rawBytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(rawBytes);
}
