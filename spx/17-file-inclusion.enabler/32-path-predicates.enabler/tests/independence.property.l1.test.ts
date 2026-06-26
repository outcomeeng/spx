import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { domainPathFilterPredicate } from "@/lib/file-inclusion/predicates/domain-path-filter";
import { gitTrackingPredicate } from "@/lib/file-inclusion/predicates/git-tracking";
import { makeGitTrackingState, PROPERTY_NUM_RUNS, samplePath } from "@testing/harnesses/file-inclusion/path-predicates";

describe("path predicates — independence properties", () => {
  it("domain-path-filter evaluation does not alter git-tracking decisions", () => {
    fc.assert(
      fc.property(fc.boolean(), (included) => {
        const path = samplePath();
        const gitState = makeGitTrackingState(included ? [path] : []);
        const before = gitTrackingPredicate(path, gitState);

        domainPathFilterPredicate(path, { exclude: [path] });

        expect(gitTrackingPredicate(path, gitState)).toEqual(before);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("git-tracking evaluation does not alter domain-path-filter decisions", () => {
    fc.assert(
      fc.property(fc.boolean(), (included) => {
        const path = samplePath();
        const filterState = { include: [path] };
        const before = domainPathFilterPredicate(path, filterState);

        gitTrackingPredicate(path, makeGitTrackingState(included ? [path] : []));

        expect(domainPathFilterPredicate(path, filterState)).toEqual(before);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
