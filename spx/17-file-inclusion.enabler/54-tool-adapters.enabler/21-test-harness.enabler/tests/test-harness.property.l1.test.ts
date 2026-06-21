import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { makeToolAdaptersConfig, PROPERTY_NUM_RUNS } from "@testing/harnesses/file-inclusion/tool-adapters";

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
});
