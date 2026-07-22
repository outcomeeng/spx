/**
 * Session reconciliation domain: resolves each recorded reference a session
 * carries — its `git_ref` branch and its `specs` / `files` entries — to exactly
 * one verdict against probe outcomes the command handler gathers.
 *
 * @module session/reconcile
 */

import { SESSION_FRONT_MATTER, type SessionMetadata } from "./types";

/** The verdict vocabulary a reconciled reference resolves to. */
export const RECONCILE_VERDICT = {
  CONFIRMED: "confirmed",
  DISCREPANCY: "discrepancy",
  UNVERIFIABLE: "unverifiable",
} as const;

export type ReconcileVerdict = (typeof RECONCILE_VERDICT)[keyof typeof RECONCILE_VERDICT];

/** The reference kinds a session record carries. */
export const RECONCILE_REFERENCE_KIND = {
  GIT_REF: SESSION_FRONT_MATTER.GIT_REF,
  SPEC: "spec",
  FILE: "file",
} as const;

export type ReconcileReferenceKind = (typeof RECONCILE_REFERENCE_KIND)[keyof typeof RECONCILE_REFERENCE_KIND];

/** Outcome of probing the recorded `git_ref` against `origin`. */
export const GIT_REF_PROBE_OUTCOME = {
  PRESENT_ON_ORIGIN: "present-on-origin",
  ABSENT_FROM_ORIGIN: "absent-from-origin",
  UNANSWERABLE: "unanswerable",
} as const;

export type GitRefProbeOutcome = (typeof GIT_REF_PROBE_OUTCOME)[keyof typeof GIT_REF_PROBE_OUTCOME];

/** Outcome of probing one recorded `specs` or `files` entry on disk. */
export const ENTRY_PROBE_OUTCOME = {
  READABLE_FILE: "readable-file",
  ABSENT: "absent",
  DIRECTORY: "directory",
  UNREADABLE: "unreadable",
} as const;

export type EntryProbeOutcome = (typeof ENTRY_PROBE_OUTCOME)[keyof typeof ENTRY_PROBE_OUTCOME];

/** One reconciled reference: what was recorded, and what its probe resolved to. */
export interface ReconcileFinding {
  readonly kind: ReconcileReferenceKind;
  readonly reference: string;
  readonly verdict: ReconcileVerdict;
  readonly evidence: string;
}

const GIT_REF_EVIDENCE: Readonly<Record<GitRefProbeOutcome, string>> = {
  [GIT_REF_PROBE_OUTCOME.PRESENT_ON_ORIGIN]: "branch present on origin",
  [GIT_REF_PROBE_OUTCOME.ABSENT_FROM_ORIGIN]: "branch absent from origin",
  [GIT_REF_PROBE_OUTCOME.UNANSWERABLE]: "git could not answer the branch lookup",
};

const ENTRY_EVIDENCE: Readonly<Record<EntryProbeOutcome, string>> = {
  [ENTRY_PROBE_OUTCOME.READABLE_FILE]: "path readable as a file",
  [ENTRY_PROBE_OUTCOME.ABSENT]: "path absent",
  [ENTRY_PROBE_OUTCOME.DIRECTORY]: "path resolves to a directory",
  [ENTRY_PROBE_OUTCOME.UNREADABLE]: "path read failed",
};

/** Maps a `git_ref` probe outcome to its verdict. */
export function gitRefVerdict(outcome: GitRefProbeOutcome): ReconcileVerdict {
  if (outcome === GIT_REF_PROBE_OUTCOME.PRESENT_ON_ORIGIN) return RECONCILE_VERDICT.CONFIRMED;
  if (outcome === GIT_REF_PROBE_OUTCOME.ABSENT_FROM_ORIGIN) return RECONCILE_VERDICT.DISCREPANCY;
  return RECONCILE_VERDICT.UNVERIFIABLE;
}

/** Maps a `specs` / `files` entry probe outcome to its verdict. */
export function entryVerdict(outcome: EntryProbeOutcome): ReconcileVerdict {
  if (outcome === ENTRY_PROBE_OUTCOME.READABLE_FILE) return RECONCILE_VERDICT.CONFIRMED;
  if (outcome === ENTRY_PROBE_OUTCOME.UNREADABLE) return RECONCILE_VERDICT.UNVERIFIABLE;
  return RECONCILE_VERDICT.DISCREPANCY;
}

/**
 * Probe outcomes for every recorded reference, positional against the metadata
 * arrays so duplicate entries keep one probe — and one finding — each.
 */
export interface ReconcileProbes {
  /** Absent exactly when the metadata records no `git_ref` (empty string). */
  readonly gitRef?: GitRefProbeOutcome;
  readonly specs: readonly EntryProbeOutcome[];
  readonly files: readonly EntryProbeOutcome[];
}

/**
 * Resolves every recorded reference to exactly one finding: the `git_ref` when
 * one is recorded, then each `specs` entry, then each `files` entry, in
 * recorded order. An empty-string `git_ref` records no reference and yields no
 * finding.
 */
export function reconcileReferences(metadata: SessionMetadata, probes: ReconcileProbes): ReconcileFinding[] {
  const findings: ReconcileFinding[] = [];

  if (metadata.git_ref !== "" && probes.gitRef !== undefined) {
    findings.push({
      kind: RECONCILE_REFERENCE_KIND.GIT_REF,
      reference: metadata.git_ref,
      verdict: gitRefVerdict(probes.gitRef),
      evidence: GIT_REF_EVIDENCE[probes.gitRef],
    });
  }

  metadata.specs.forEach((reference, index) => {
    findings.push(entryFinding(RECONCILE_REFERENCE_KIND.SPEC, reference, probes.specs[index]));
  });
  metadata.files.forEach((reference, index) => {
    findings.push(entryFinding(RECONCILE_REFERENCE_KIND.FILE, reference, probes.files[index]));
  });

  return findings;
}

function entryFinding(
  kind: ReconcileReferenceKind,
  reference: string,
  outcome: EntryProbeOutcome,
): ReconcileFinding {
  return {
    kind,
    reference,
    verdict: entryVerdict(outcome),
    evidence: ENTRY_EVIDENCE[outcome],
  };
}
