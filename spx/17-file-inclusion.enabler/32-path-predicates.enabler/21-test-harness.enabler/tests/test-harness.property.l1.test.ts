import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  makeGitTrackingState,
  pathFilter,
  pathPrefix,
  PROPERTY_NUM_RUNS,
  samplePath,
  trackedPath,
} from "@testing/harnesses/file-inclusion/path-predicates";

describe("path-predicates test harness — properties", () => {
  it("makeGitTrackingState returns reader state that reports exactly the included paths", () => {
    fc.assert(
      fc.property(fc.boolean(), (includePath) => {
        const path = trackedPath();
        const state = makeGitTrackingState(includePath ? [path] : []);

        expect(state.reader.isInIncludedSet(path)).toBe(includePath);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("pathFilter preserves generated include and exclude prefixes", () => {
    fc.assert(
      fc.property(fc.boolean(), (useInclude) => {
        const path = samplePath();
        const prefix = pathPrefix(path);
        const config = useInclude
          ? pathFilter({ include: [prefix] })
          : pathFilter({ exclude: [prefix] });

        expect(config).toEqual(useInclude ? { include: [prefix] } : { exclude: [prefix] });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
