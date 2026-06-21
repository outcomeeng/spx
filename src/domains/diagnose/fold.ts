/**
 * Diagnose verdict fold — reduces the per-check buckets to one overall verdict
 * by the fixed precedence broken > unknown > degraded > healthy (not-applicable
 * excluded), and maps the overall verdict to the process exit code. Pure
 * functions over bucket inputs; no I/O.
 *
 * @module domains/diagnose/fold
 */

import { OVERALL_VERDICT, type OverallVerdict, VERDICT_BUCKET, type VerdictBucket } from "./types";

/**
 * The fold precedence, highest severity first. The overall verdict is the
 * highest-precedence bucket present among the checks, with not-applicable
 * excluded; when every check is not-applicable the overall verdict is healthy.
 */
const FOLD_PRECEDENCE: readonly OverallVerdict[] = [
  OVERALL_VERDICT.BROKEN,
  OVERALL_VERDICT.UNKNOWN,
  OVERALL_VERDICT.DEGRADED,
  OVERALL_VERDICT.HEALTHY,
];

/** The exit code each overall verdict maps to: healthy 0, degraded 1, unknown 2, broken 3. */
export const VERDICT_EXIT_CODE: Readonly<Record<OverallVerdict, number>> = {
  [OVERALL_VERDICT.HEALTHY]: 0,
  [OVERALL_VERDICT.DEGRADED]: 1,
  [OVERALL_VERDICT.UNKNOWN]: 2,
  [OVERALL_VERDICT.BROKEN]: 3,
};

/**
 * Folds the per-check buckets into one overall verdict by the fixed precedence,
 * excluding not-applicable. An empty input, or one where every bucket is
 * not-applicable, folds to healthy.
 */
export function foldOverallVerdict(buckets: readonly VerdictBucket[]): OverallVerdict {
  const decisive = buckets.filter((bucket): bucket is OverallVerdict => bucket !== VERDICT_BUCKET.NOT_APPLICABLE);
  for (const verdict of FOLD_PRECEDENCE) {
    if (decisive.includes(verdict)) return verdict;
  }
  return OVERALL_VERDICT.HEALTHY;
}

/** Maps an overall verdict to its process exit code. */
export function overallExitCode(overall: OverallVerdict): number {
  return VERDICT_EXIT_CODE[overall];
}
