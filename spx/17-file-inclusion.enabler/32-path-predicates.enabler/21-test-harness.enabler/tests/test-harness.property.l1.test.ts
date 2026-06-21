import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  arbNodeSegment,
  arbSubpath,
  integrationConfig,
  makeIgnoreSourceConfig,
  PROPERTY_NUM_RUNS,
  spxPath,
} from "@testing/harnesses/file-inclusion/path-predicates";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("path-predicates test harness — properties", () => {
  it("makeIgnoreSourceConfig writes the segments and returns a reader reporting paths under them as under-ignore-source", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig, async (env) => {
          const config = await makeIgnoreSourceConfig(env, [segment]);

          expect(config.reader.isUnderIgnoreSource(spxPath(segment, sub))).toBe(true);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
