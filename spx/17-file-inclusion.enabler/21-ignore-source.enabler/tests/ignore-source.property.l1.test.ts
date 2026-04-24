import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createExcludeFilter } from "@/exclude/index.js";
import { withTestEnv } from "@/spec/testing/index.js";

import {
  ARBITRARY_QUERY_MAX,
  ARBITRARY_SEGMENT_MAX,
  INTEGRATION_CONFIG,
  NODE_SEGMENT_OTHER,
  NODE_SEGMENT_SIMPLE,
  PROPERTY_NUM_RUNS,
  spxPath,
  SUBPATHS_FOR_PREFIX_CHECK,
  TOOL_PYTEST,
  TOOL_VITEST,
  writeExclude,
} from "./support.js";

describe("ignore-source — properties", () => {
  it("filtering is deterministic: the same EXCLUDE content always produces the same exclusion set", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(NODE_SEGMENT_SIMPLE, NODE_SEGMENT_OTHER), {
          maxLength: ARBITRARY_SEGMENT_MAX,
        }),
        fc.array(
          fc.tuple(
            fc.constantFrom(NODE_SEGMENT_SIMPLE, NODE_SEGMENT_OTHER),
            fc.constantFrom(...SUBPATHS_FOR_PREFIX_CHECK),
          ),
          { minLength: 1, maxLength: ARBITRARY_QUERY_MAX },
        ),
        async (segments, queries) => {
          await withTestEnv(INTEGRATION_CONFIG, async (env) => {
            await writeExclude(env, segments);

            const filterA = createExcludeFilter(env.projectDir);
            const filterB = createExcludeFilter(env.projectDir);

            for (const [segment, rest] of queries) {
              const input = spxPath(segment, rest);
              expect(filterA.isExcluded(input)).toBe(filterB.isExcluded(input));
            }

            expect(filterA.toToolFlags(TOOL_PYTEST)).toEqual(filterB.toToolFlags(TOOL_PYTEST));
            expect(filterA.toToolFlags(TOOL_VITEST)).toEqual(filterB.toToolFlags(TOOL_VITEST));
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("path matching is prefix-based: any file inside an excluded node directory matches the exclusion", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...SUBPATHS_FOR_PREFIX_CHECK), {
          minLength: 1,
          maxLength: ARBITRARY_QUERY_MAX,
        }),
        async (subpaths) => {
          await withTestEnv(INTEGRATION_CONFIG, async (env) => {
            await writeExclude(env, [NODE_SEGMENT_SIMPLE]);

            const filter = createExcludeFilter(env.projectDir);

            for (const sub of subpaths) {
              expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, sub))).toBe(true);
              expect(filter.isExcluded(spxPath(NODE_SEGMENT_OTHER, sub))).toBe(false);
            }
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
