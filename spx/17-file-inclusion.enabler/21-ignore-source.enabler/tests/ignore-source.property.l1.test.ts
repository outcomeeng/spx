import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  arbitraryQueryMax,
  arbitrarySegmentMax,
  arbNodeSegment,
  arbSubpath,
  integrationConfig,
  PROPERTY_NUM_RUNS,
  readerConfig,
  spxPath,
  writeExclude,
} from "./support";

describe("ignore-source — properties", () => {
  it("the reader is deterministic: the same project root and the same ignore-source file content always produce the same parsed entry set and the same membership-query results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbNodeSegment, { maxLength: arbitrarySegmentMax() }),
        fc.array(fc.tuple(arbNodeSegment, arbSubpath), {
          minLength: 1,
          maxLength: arbitraryQueryMax(),
        }),
        async (segments, queries) => {
          await withTestEnv(integrationConfig(), async (env) => {
            await writeExclude(env, segments);

            const readerA = createIgnoreSourceReader(env.productDir, readerConfig());
            const readerB = createIgnoreSourceReader(env.productDir, readerConfig());

            for (const [segment, rest] of queries) {
              const input = spxPath(segment, rest);
              expect(readerA.isUnderIgnoreSource(input)).toBe(readerB.isUnderIgnoreSource(input));
            }

            const entriesA = readerA.entries().map((e) => e.segment).sort();
            const entriesB = readerB.entries().map((e) => e.segment).sort();
            expect(entriesA).toEqual(entriesB);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("membership matching is prefix-based: every path inside the directory of a parsed entry reports as under-ignore-source, and no path outside every such directory reports as under-ignore-source", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbNodeSegment, arbNodeSegment).filter(([a, b]) => a !== b),
        fc.array(arbSubpath, { minLength: 1, maxLength: arbitraryQueryMax() }),
        async ([listed, unlisted], subpaths) => {
          await withTestEnv(integrationConfig(), async (env) => {
            await writeExclude(env, [listed]);

            const reader = createIgnoreSourceReader(env.productDir, readerConfig());

            for (const sub of subpaths) {
              expect(reader.isUnderIgnoreSource(spxPath(listed, sub))).toBe(true);
              expect(reader.isUnderIgnoreSource(spxPath(unlisted, sub))).toBe(false);
            }
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
