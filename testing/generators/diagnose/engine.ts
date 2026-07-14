import { CHECK_NAME, type CheckName } from "@/domains/diagnose/manifest";
import { OVERALL_VERDICT, type OverallVerdict, VERDICT_BUCKET, type VerdictBucket } from "@/domains/diagnose/types";

export interface CheckSelectionCase {
  readonly name: string;
  readonly checks: readonly CheckName[];
}

export interface FoldMappingCase {
  readonly name: string;
  readonly buckets: readonly VerdictBucket[];
  readonly overall: OverallVerdict;
}

/** Finite source-derived selection cases covering inclusion, exclusion, and order. */
export function checkSelectionCases(): readonly CheckSelectionCase[] {
  const checks = Object.values(CHECK_NAME);
  return [
    { name: "source order", checks },
    { name: "reverse order", checks: [...checks].reverse() },
    { name: "selected endpoints only", checks: [checks[0], checks[checks.length - 1]] },
  ];
}

export function missingRunnerCheck(): CheckName {
  return Object.values(CHECK_NAME)[0];
}

/** Finite source-derived precedence cases for the overall fold. */
export function foldMappingCases(): readonly FoldMappingCase[] {
  return [
    {
      name: "broken wins",
      buckets: Object.values(VERDICT_BUCKET),
      overall: OVERALL_VERDICT.BROKEN,
    },
    {
      name: "unknown wins without broken",
      buckets: [
        VERDICT_BUCKET.UNKNOWN,
        VERDICT_BUCKET.DEGRADED,
        VERDICT_BUCKET.HEALTHY,
        VERDICT_BUCKET.NOT_APPLICABLE,
      ],
      overall: OVERALL_VERDICT.UNKNOWN,
    },
    {
      name: "degraded wins without broken or unknown",
      buckets: [VERDICT_BUCKET.DEGRADED, VERDICT_BUCKET.HEALTHY, VERDICT_BUCKET.NOT_APPLICABLE],
      overall: OVERALL_VERDICT.DEGRADED,
    },
    {
      name: "healthy wins with healthy and not-applicable",
      buckets: [VERDICT_BUCKET.HEALTHY, VERDICT_BUCKET.NOT_APPLICABLE],
      overall: OVERALL_VERDICT.HEALTHY,
    },
    {
      name: "all not-applicable is healthy",
      buckets: [VERDICT_BUCKET.NOT_APPLICABLE, VERDICT_BUCKET.NOT_APPLICABLE],
      overall: OVERALL_VERDICT.HEALTHY,
    },
    {
      name: "empty is healthy",
      buckets: [],
      overall: OVERALL_VERDICT.HEALTHY,
    },
  ];
}
