import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  ARBITRARY_QUERY_MAX,
  ARBITRARY_SEGMENT_MAX,
  arbNodeSegment,
  arbSubpath,
  INTEGRATION_CONFIG,
  PROPERTY_NUM_RUNS,
  READER_CONFIG,
  spxPath,
  writeExclude,
} from "./support";

describe("ignore-source — properties", () => {
  it("the reader is deterministic: the same project root and the same ignore-source file content always produce the same parsed entry set and the same membership-query results", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbNodeSegment, { maxLength: ARBITRARY_SEGMENT_MAX }),
        fc.array(fc.tuple(arbNodeSegment, arbSubpath), {
          minLength: 1,
          maxLength: ARBITRARY_QUERY_MAX,
        }),
        async (segments, queries) => {
          await withTestEnv(INTEGRATION_CONFIG, async (env) => {
            await writeExclude(env, segments);

            const readerA = createIgnoreSourceReader(env.projectDir, READER_CONFIG);
            const readerB = createIgnoreSourceReader(env.projectDir, READER_CONFIG);

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
        fc.array(arbSubpath, { minLength: 1, maxLength: ARBITRARY_QUERY_MAX }),
        async ([listed, unlisted], subpaths) => {
          await withTestEnv(INTEGRATION_CONFIG, async (env) => {
            await writeExclude(env, [listed]);

            const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);

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
