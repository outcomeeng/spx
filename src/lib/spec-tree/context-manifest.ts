/**
 * Pure vocabulary and computation for the spec context manifest: the
 * projection-mode and selection-reason registries, the schema-version-3
 * manifest shape, composition of the shared selection's entries into manifest
 * entries, document decoding primitives and exact-path diagnostics.
 *
 * Filesystem and git reads stay in the command handler; every function here is
 * a pure function over supplied inputs.
 *
 * @module lib/spec-tree/context-manifest
 */

import type { MethodologyIdentity } from "@/config/methodology";

/** Manifest schema version; changes exactly when the manifest shape changes incompatibly. */
export const SPEC_CONTEXT_MANIFEST_SCHEMA_VERSION = 3;

/** Projection modes, ordered so a higher value delivers more of the document: Full satisfies Digest, never the reverse. */
export const SPEC_CONTEXT_MODE = { REFERENCE: 0, DIGEST: 1, FULL: 2 } as const;
export type SpecContextMode = (typeof SPEC_CONTEXT_MODE)[keyof typeof SPEC_CONTEXT_MODE];

/** The name each projection mode carries in the manifest. */
export const SPEC_CONTEXT_MODE_NAME = {
  [SPEC_CONTEXT_MODE.FULL]: "full",
  [SPEC_CONTEXT_MODE.DIGEST]: "digest",
  [SPEC_CONTEXT_MODE.REFERENCE]: "reference",
} as const satisfies Record<SpecContextMode, string>;

export type SpecContextModeName = (typeof SPEC_CONTEXT_MODE_NAME)[SpecContextMode];

/**
 * Every structural relation through which one requested target selects an
 * entry, declared in precedence order: where several relations hold for one
 * target-entry pair, the manifest records the first.
 */
export const SPEC_CONTEXT_SELECTION_REASON = {
  TARGET: "target",
  PRODUCT: "product",
  ANCESTOR: "ancestor",
  SIBLING: "sibling",
  IMMEDIATE_CHILD: "immediate-child",
  OUTCOME_RECORD: "outcome-record",
  KNOWLEDGE_INDEX: "knowledge-index",
  CITED_DECISION: "cited-decision",
  ISSUE: "issue",
} as const;

export type SpecContextSelectionReason =
  (typeof SPEC_CONTEXT_SELECTION_REASON)[keyof typeof SPEC_CONTEXT_SELECTION_REASON];

/** The selection-reason precedence: the registry's declaration order. */
export const SPEC_CONTEXT_SELECTION_REASON_PRECEDENCE: readonly SpecContextSelectionReason[] = Object.values(
  SPEC_CONTEXT_SELECTION_REASON,
);

/** The one projection mode each selection reason requires. */
export const SPEC_CONTEXT_REASON_MODE: Readonly<Record<SpecContextSelectionReason, SpecContextMode>> = {
  [SPEC_CONTEXT_SELECTION_REASON.TARGET]: SPEC_CONTEXT_MODE.FULL,
  [SPEC_CONTEXT_SELECTION_REASON.PRODUCT]: SPEC_CONTEXT_MODE.FULL,
  [SPEC_CONTEXT_SELECTION_REASON.ANCESTOR]: SPEC_CONTEXT_MODE.FULL,
  [SPEC_CONTEXT_SELECTION_REASON.SIBLING]: SPEC_CONTEXT_MODE.DIGEST,
  [SPEC_CONTEXT_SELECTION_REASON.IMMEDIATE_CHILD]: SPEC_CONTEXT_MODE.DIGEST,
  [SPEC_CONTEXT_SELECTION_REASON.OUTCOME_RECORD]: SPEC_CONTEXT_MODE.FULL,
  [SPEC_CONTEXT_SELECTION_REASON.KNOWLEDGE_INDEX]: SPEC_CONTEXT_MODE.REFERENCE,
  [SPEC_CONTEXT_SELECTION_REASON.CITED_DECISION]: SPEC_CONTEXT_MODE.FULL,
  [SPEC_CONTEXT_SELECTION_REASON.ISSUE]: SPEC_CONTEXT_MODE.REFERENCE,
};

/** One requested target's selection of an entry, with the reason it selects it. */
export interface SpecContextTargetSelection {
  readonly target: string;
  readonly reason: SpecContextSelectionReason;
}

/** One entry `show` delivers, with its composed mode and one selection per requested target that selects it. */
export interface SpecContextManifestEntry {
  readonly path: string;
  readonly mode: SpecContextModeName;
  readonly selections: readonly SpecContextTargetSelection[];
  /** Present exactly when a selection carries the cited-decision reason: every selected document that cites it, in `show` order. */
  readonly citedBy?: readonly string[];
}

export interface SpecContextManifest {
  readonly schemaVersion: number;
  readonly bootstrap: boolean;
  readonly methodology: MethodologyIdentity;
  readonly entries: readonly SpecContextManifestEntry[];
}

/**
 * One selected entry with every target-reason pair that holds for it, before
 * precedence applies, and every selected document that cites it when any does.
 */
export interface SpecContextSelectedEntry {
  readonly path: string;
  readonly reasons: readonly SpecContextTargetSelection[];
  readonly citedBy?: readonly string[];
}

/** The highest mode the given reasons require, or none for no reason. */
export function specContextReasonsMode(
  reasons: readonly SpecContextTargetSelection[],
): SpecContextMode | undefined {
  let highest: SpecContextMode | undefined;
  for (const { reason } of reasons) {
    const mode = SPEC_CONTEXT_REASON_MODE[reason];
    if (highest === undefined || mode > highest) highest = mode;
  }
  return highest;
}

/**
 * One selection per target: the first reason in precedence among those that
 * hold for that target, in ordinal order of canonical target path.
 */
export function specContextTargetSelections(
  reasons: readonly SpecContextTargetSelection[],
): readonly SpecContextTargetSelection[] {
  const byTarget = new Map<string, SpecContextSelectionReason>();
  for (const { target, reason } of reasons) {
    const current = byTarget.get(target);
    if (
      current === undefined
      || SPEC_CONTEXT_SELECTION_REASON_PRECEDENCE.indexOf(reason)
        < SPEC_CONTEXT_SELECTION_REASON_PRECEDENCE.indexOf(current)
    ) {
      byTarget.set(target, reason);
    }
  }
  return [...byTarget]
    .sort(([left], [right]) => compareSpecContextOrdinal(left, right))
    .map(([target, reason]) => ({ target, reason }));
}

/**
 * Composes the shared selection's entries, in `show` order, into manifest
 * entries: each entry's selections reduce to one reason per target, and its
 * mode is the highest mode those selections require. An entry carries its
 * citing documents exactly when one of its reduced selections keeps the
 * cited-decision reason, whichever reasons other targets record for it.
 * Selections follow ordinal target order, so every permutation of the same
 * operands yields byte-identical output.
 */
export function composeSpecContextManifestEntries(
  entries: readonly SpecContextSelectedEntry[],
): readonly SpecContextManifestEntry[] {
  return entries.map(({ path, reasons, citedBy }) => {
    const selections = specContextTargetSelections(reasons);
    const mode = specContextReasonsMode(selections);
    if (mode === undefined) throw new Error(`No requested target selects context entry ${path}`);
    const cited = selections.some(({ reason }) => reason === SPEC_CONTEXT_SELECTION_REASON.CITED_DECISION);
    return {
      path,
      mode: SPEC_CONTEXT_MODE_NAME[mode],
      selections,
      ...(cited && citedBy !== undefined ? { citedBy } : {}),
    };
  });
}

/** Bootstrap state: a tree holding a product spec and no node is in bootstrap. */
export function specContextBootstrap(hasProductSpec: boolean, nodeCount: number): boolean {
  return hasProductSpec && nodeCount === 0;
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
 * Decodes raw document bytes as strict UTF-8; any invalid sequence throws.
 * A leading byte-order mark stays in the decoded text so the content
 * preserves the source bytes.
 */
export function decodeContextDocumentUtf8(rawBytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(rawBytes);
}
