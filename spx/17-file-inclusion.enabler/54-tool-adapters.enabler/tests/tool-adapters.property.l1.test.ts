import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { REGISTERED_TOOL_NAMES, toToolArguments } from "@/lib/file-inclusion/adapters";

import { makeScope, makeToolAdaptersConfig, PROPERTY_NUM_RUNS } from "./support";

const testTool = REGISTERED_TOOL_NAMES[0];
if (!testTool) throw new Error("adapters.property: no registered tools");

const arbExcludedPaths = fc.uniqueArray(
  fc.string({ minLength: 1 }).filter((s) => !s.startsWith("-")),
  { minLength: 0 },
);

const arbIgnoreFlag = fc
  .string({ minLength: 1 })
  .filter((s) => s.startsWith("--") && s.length >= 3);

describe("tool adapters — properties", () => {
  it("adapters are pure over (ScopeResult, AdapterConfig): same inputs always produce the same output regardless of call history", () => {
    fc.assert(
      fc.property(arbExcludedPaths, arbIgnoreFlag, (excludedPaths, ignoreFlag) => {
        const scope = makeScope(excludedPaths);
        const config = makeToolAdaptersConfig({ [testTool]: ignoreFlag });

        if (REGISTERED_TOOL_NAMES.length > 1) {
          const otherTool = REGISTERED_TOOL_NAMES.find((t) => t !== testTool) ?? testTool;
          toToolArguments(makeScope(["other/path.ts"]), otherTool, makeToolAdaptersConfig({ [otherTool]: "--other" }));
        }

        const first = toToolArguments(scope, testTool, config);
        const second = toToolArguments(scope, testTool, config);

        expect(first).toEqual(second);
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("output references the excluded set exactly: every output path is in scope.excluded, every excluded path appears in output", () => {
    fc.assert(
      fc.property(arbExcludedPaths, arbIgnoreFlag, (excludedPaths, ignoreFlag) => {
        const scope = makeScope(excludedPaths);
        const config = makeToolAdaptersConfig({ [testTool]: ignoreFlag });

        const result = toToolArguments(scope, testTool, config);

        const outputPaths = new Set<string>();
        for (let i = 0; i < result.length; i++) {
          if (result[i] === ignoreFlag) {
            const next = result[i + 1];
            if (next !== undefined) {
              outputPaths.add(next);
            }
          }
        }

        const excludedSet = new Set(excludedPaths);

        for (const path of outputPaths) {
          expect(excludedSet.has(path), `"${path}" in output must be in scope.excluded`).toBe(true);
        }
        for (const path of excludedPaths) {
          expect(outputPaths.has(path), `"${path}" from scope.excluded must appear in output`).toBe(true);
        }
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
