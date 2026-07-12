/**
 * Diagnose domain types — the verdict buckets, per-check record shape, and the
 * folded report the deterministic `spx diagnose` pipeline classifies into and
 * emits. Pure data definitions with no I/O; the engine in `src/domains/diagnose`
 * classifies readings into these and the descriptor renders them.
 *
 * @module domains/diagnose/types
 */

/**
 * The bucket a per-check verdict folds into. Every check-specific verdict label
 * maps to exactly one bucket; the overall verdict is folded from buckets.
 */
export const VERDICT_BUCKET = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNKNOWN: "unknown",
  BROKEN: "broken",
  NOT_APPLICABLE: "not-applicable",
} as const;

export type VerdictBucket = (typeof VERDICT_BUCKET)[keyof typeof VERDICT_BUCKET];

/**
 * The overall verdict folded across the per-check buckets. Excludes
 * not-applicable: a check with no applicable surface never decides the overall
 * verdict.
 */
export const OVERALL_VERDICT = {
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  UNKNOWN: "unknown",
  BROKEN: "broken",
} as const;

export type OverallVerdict = (typeof OVERALL_VERDICT)[keyof typeof OVERALL_VERDICT];

/** One diagnostic check's result: its verdict, the bucket it folds into, the readings it judged, and a remediation hint. */
export interface CheckRecord {
  /** The check's stable name (matches the manifest check-set entry). */
  readonly name: string;
  /** The check-specific verdict label (e.g. "reachable", "below-floor"). */
  readonly verdict: string;
  /** The bucket the verdict folds into. */
  readonly bucket: VerdictBucket;
  /** The gathered readings verbatim, keyed by reading name. */
  readonly readings: Readonly<Record<string, string>>;
  /** A remediation hint paired with the verdict. */
  readonly remediation: string;
}

/** The aggregated diagnose report: every per-check record plus the folded overall verdict. */
export interface DiagnoseReport {
  readonly checks: readonly CheckRecord[];
  readonly overall: OverallVerdict;
}

/** The fields every rendered diagnose report carries. */
export const DIAGNOSE_REPORT_FIELDS = ["checks", "overall"] as const;

/** The fields every per-check record in the rendered report carries, in render order. */
export const CHECK_RECORD_FIELDS = ["name", "verdict", "bucket", "readings", "remediation"] as const;
