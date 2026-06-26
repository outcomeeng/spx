import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { domainPathFilterPredicate } from "@/lib/file-inclusion/predicates/domain-path-filter";
import { gitTrackingPredicate } from "@/lib/file-inclusion/predicates/git-tracking";
import { makeGitTrackingState, PROPERTY_NUM_RUNS, samplePath } from "@testing/harnesses/file-inclusion/path-predicates";

describe("path predicates — purity properties", () => {
  it("git-tracking decisions are stable for equal path and state", () => {
    fc.assert(
      fc.property(fc.boolean(), (included) => {
        const path = samplePath();
        const state = makeGitTrackingState(included ? [path] : []);

        expect(gitTrackingPredicate(path, state)).toEqual(gitTrackingPredicate(path, state));
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("domain-path-filter decisions are stable for equal path and state", () => {
    fc.assert(
      fc.property(fc.boolean(), (excluded) => {
        const path = samplePath();
        const state = excluded ? { exclude: [path] } : { include: [path] };

        expect(domainPathFilterPredicate(path, state)).toEqual(domainPathFilterPredicate(path, state));
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
