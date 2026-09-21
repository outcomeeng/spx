import { describe, expect, it } from "vitest";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { decisiveBucketArrangements } from "@testing/generators/diagnose/fold-cases";

describe("the overall verdict folds the per-check buckets by the fixed precedence broken > unknown > degraded > healthy", () => {
  // The domain is every subset of the decisive buckets, and each subset arrives
  // in both the ascending and the descending arrangement of the precedence the
  // assertion states. A fold that returned a bucket by its position — the first
  // decisive argument, or the last — answers one arrangement correctly and the
  // other wrongly, so only a precedence scan satisfies every case. The expected
  // verdict is the highest severity rank present, taken as a maximum over the
  // ranks the assertion's own ordering declares, never by rescanning the list
  // the fold consults.
  it.each(decisiveBucketArrangements())(
    "folds $label to the most severe decisive bucket present",
    ({ buckets, present }) => {
      expect(foldOverallVerdict(buckets)).toBe(
        [OVERALL_VERDICT.HEALTHY, OVERALL_VERDICT.DEGRADED, OVERALL_VERDICT.UNKNOWN, OVERALL_VERDICT.BROKEN]
          .filter((verdict) => present.includes(verdict))
          .at(-1) ?? OVERALL_VERDICT.HEALTHY,
      );
    },
  );

  it("folds an all-not-applicable bucket set to healthy", () => {
    expect(foldOverallVerdict([VERDICT_BUCKET.NOT_APPLICABLE, VERDICT_BUCKET.NOT_APPLICABLE])).toBe(
      OVERALL_VERDICT.HEALTHY,
    );
  });

  it("folds an empty bucket set to healthy", () => {
    expect(foldOverallVerdict([])).toBe(OVERALL_VERDICT.HEALTHY);
  });
});
