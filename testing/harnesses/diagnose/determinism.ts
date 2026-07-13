import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { classifySpxReachability } from "@/domains/diagnose/checks/spx-reachability";
import { foldOverallVerdict, overallExitCode } from "@/domains/diagnose/fold";
import { OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { arbitraryNameToken, arbitrarySpxFloor } from "@testing/generators/diagnose/manifest";
import { spxReachabilityReading } from "@testing/generators/diagnose/reachability";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

const arbitraryBucket = (): fc.Arbitrary<
  (typeof VERDICT_BUCKET)[keyof typeof VERDICT_BUCKET]
> => fc.constantFrom(...Object.values(VERDICT_BUCKET));

export function registerDiagnoseDeterminismProperties(): void {
  describe("the diagnose fold is deterministic over its bucket inputs", () => {
    it("folds an identical bucket set to the same overall verdict on every evaluation", () => {
      assertProperty(
        fc.array(arbitraryBucket()),
        (buckets) => {
          expect(foldOverallVerdict(buckets)).toBe(
            foldOverallVerdict([...buckets]),
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("folds a bucket set independently of the order its buckets are presented in", () => {
      assertProperty(
        fc.array(arbitraryBucket()),
        (buckets) => {
          expect(foldOverallVerdict([...buckets].reverse())).toBe(
            foldOverallVerdict(buckets),
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("yields an exit code that is a total function of the folded overall verdict", () => {
      assertProperty(
        fc.array(arbitraryBucket()),
        (buckets) => {
          const overall = foldOverallVerdict(buckets);
          expect(overallExitCode(overall)).toBe(
            overallExitCode(foldOverallVerdict([...buckets].reverse())),
          );
          expect(Object.values(OVERALL_VERDICT)).toContain(overall);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });

  describe("per-check classification is deterministic over identical readings and manifest", () => {
    it("classifies an identical reading and floor to the same per-check verdict on every evaluation", () => {
      assertProperty(
        fc.tuple(
          arbitrarySpxFloor(),
          arbitraryNameToken(),
          arbitraryNameToken(),
        ),
        ([floor, path, version]) => {
          const reading = spxReachabilityReading({
            resolvedPath: path,
            version,
          });
          expect(classifySpxReachability(reading, floor)).toEqual(
            classifySpxReachability(reading, floor),
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}
