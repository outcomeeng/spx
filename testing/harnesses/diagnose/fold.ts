import { describe, expect, it } from "vitest";

import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";

export function registerDiagnoseFoldMappings(): void {
  describe("the overall verdict folds the per-check buckets by the fixed precedence broken > unknown > degraded > healthy", () => {
    // Each row removes the most severe bucket of the row above it, so the next bucket in the
    // precedence must win — proving the fold selects the most severe decisive bucket present.
    it.each([
      {
        buckets: [
          VERDICT_BUCKET.BROKEN,
          VERDICT_BUCKET.UNKNOWN,
          VERDICT_BUCKET.DEGRADED,
          VERDICT_BUCKET.HEALTHY,
          VERDICT_BUCKET.NOT_APPLICABLE,
        ],
        overall: OVERALL_VERDICT.BROKEN,
      },
      {
        buckets: [
          VERDICT_BUCKET.UNKNOWN,
          VERDICT_BUCKET.DEGRADED,
          VERDICT_BUCKET.HEALTHY,
          VERDICT_BUCKET.NOT_APPLICABLE,
        ],
        overall: OVERALL_VERDICT.UNKNOWN,
      },
      {
        buckets: [
          VERDICT_BUCKET.DEGRADED,
          VERDICT_BUCKET.HEALTHY,
          VERDICT_BUCKET.NOT_APPLICABLE,
        ],
        overall: OVERALL_VERDICT.DEGRADED,
      },
      {
        buckets: [VERDICT_BUCKET.HEALTHY, VERDICT_BUCKET.NOT_APPLICABLE],
        overall: OVERALL_VERDICT.HEALTHY,
      },
    ])(
      "a bucket set whose most severe decisive bucket is the head folds to $overall",
      ({ buckets, overall }) => {
        expect(foldOverallVerdict(buckets)).toBe(overall);
      },
    );

    it("folds an all-not-applicable bucket set to healthy", () => {
      expect(
        foldOverallVerdict([
          VERDICT_BUCKET.NOT_APPLICABLE,
          VERDICT_BUCKET.NOT_APPLICABLE,
        ]),
      ).toBe(OVERALL_VERDICT.HEALTHY);
    });

    it("folds an empty bucket set to healthy", () => {
      expect(foldOverallVerdict([])).toBe(OVERALL_VERDICT.HEALTHY);
    });
  });
}
