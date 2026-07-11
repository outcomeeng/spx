import { WORKTREE_POOL_VERDICT } from "@/domains/diagnose/checks/worktree-pool";
import { OVERALL_VERDICT, type OverallVerdict, VERDICT_BUCKET, type VerdictBucket } from "@/domains/diagnose/types";
import { SEVERITY, type Severity } from "@/lib/styled-output/styled-output";

/** Maps each per-check verdict bucket to the styled-output severity its glyph and color key on. */
export const BUCKET_SEVERITY: Readonly<Record<VerdictBucket, Severity>> = {
  [VERDICT_BUCKET.HEALTHY]: SEVERITY.OK,
  [VERDICT_BUCKET.DEGRADED]: SEVERITY.WARN,
  [VERDICT_BUCKET.UNKNOWN]: SEVERITY.UNKNOWN,
  [VERDICT_BUCKET.BROKEN]: SEVERITY.ERROR,
  [VERDICT_BUCKET.NOT_APPLICABLE]: SEVERITY.MUTED,
} as const;

/** Maps the overall verdict to the styled-output severity its summary line is colored by. */
export const OVERALL_SEVERITY: Readonly<Record<OverallVerdict, Severity>> = {
  [OVERALL_VERDICT.HEALTHY]: SEVERITY.OK,
  [OVERALL_VERDICT.DEGRADED]: SEVERITY.WARN,
  [OVERALL_VERDICT.UNKNOWN]: SEVERITY.UNKNOWN,
  [OVERALL_VERDICT.BROKEN]: SEVERITY.ERROR,
} as const;

export const CANONICAL_CHECKOUT_PROBLEM = {
  [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED]: "The designated main checkout is not attached to any branch.",
  [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING]: "The designated main checkout could not be found.",
  [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH]: "The designated main checkout is attached to the wrong branch.",
} as const;

export type CanonicalCheckoutFailureVerdict = keyof typeof CANONICAL_CHECKOUT_PROBLEM;
