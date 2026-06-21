import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { foldOverallVerdict, overallExitCode } from "@/domains/diagnose/fold";
import { OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";

const arbitraryBucket = (): fc.Arbitrary<(typeof VERDICT_BUCKET)[keyof typeof VERDICT_BUCKET]> =>
  fc.constantFrom(...Object.values(VERDICT_BUCKET));

describe("the diagnose fold is deterministic over its bucket inputs", () => {
  it("folds an identical bucket set to the same overall verdict on every evaluation", () => {
    fc.assert(
      fc.property(fc.array(arbitraryBucket()), (buckets) => {
        expect(foldOverallVerdict(buckets)).toBe(foldOverallVerdict([...buckets]));
      }),
    );
  });

  it("folds a bucket set independently of the order its buckets are presented in", () => {
    fc.assert(
      fc.property(fc.array(arbitraryBucket()), (buckets) => {
        expect(foldOverallVerdict([...buckets].reverse())).toBe(foldOverallVerdict(buckets));
      }),
    );
  });

  it("yields an exit code that is a total function of the folded overall verdict", () => {
    fc.assert(
      fc.property(fc.array(arbitraryBucket()), (buckets) => {
        const overall = foldOverallVerdict(buckets);
        expect(overallExitCode(overall)).toBe(overallExitCode(foldOverallVerdict([...buckets].reverse())));
        expect(Object.values(OVERALL_VERDICT)).toContain(overall);
      }),
    );
  });
});
