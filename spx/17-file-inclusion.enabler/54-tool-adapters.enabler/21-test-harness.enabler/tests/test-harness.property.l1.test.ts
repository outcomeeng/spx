import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { makeScope, makeToolAdaptersConfig, PROPERTY_NUM_RUNS } from "@testing/harnesses/file-inclusion/tool-adapters";

describe("tool-adapters test harness — properties", () => {
  it("makeToolAdaptersConfig maps each tool name to an adapter config carrying its ignore flag", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1 }), fc.string()), (tools) => {
        const config = makeToolAdaptersConfig(tools);

        for (const [name, flag] of Object.entries(tools)) {
          expect(config[name]).toEqual({ ignoreFlag: flag });
        }
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("makeScope partitions the given paths into included and excluded scope entries", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), fc.array(fc.string()), (excluded, included) => {
        const scope = makeScope(excluded, included);

        expect(scope.excluded.map((entry) => entry.path)).toEqual(excluded);
        expect(scope.included.map((entry) => entry.path)).toEqual(included);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
