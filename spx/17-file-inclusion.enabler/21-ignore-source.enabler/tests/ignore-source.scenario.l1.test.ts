import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  arbNestedNodeSegment,
  arbNodeSegment,
  arbSubpath,
  commentHeader,
  commentMiddle,
  integrationConfig,
  PROPERTY_NUM_RUNS,
  readerConfig,
  spxPath,
  writeExclude,
  writeExcludeRaw,
} from "@testing/harnesses/file-inclusion/ignore-source";

describe("ignore-source — scenarios", () => {
  it("ignore-source file lists a node path and the reader reports a path under that node directory as under-ignore-source", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbNodeSegment, arbNodeSegment).filter(([a, b]) => a !== b),
        arbSubpath,
        async ([listed, unlisted], sub) => {
          await withTestEnv(integrationConfig(), async (env) => {
            await writeExclude(env, [listed]);

            const reader = createIgnoreSourceReader(env.productDir, readerConfig());

            expect(reader.isUnderIgnoreSource(spxPath(listed, sub))).toBe(true);
            expect(reader.isUnderIgnoreSource(spxPath(unlisted, sub))).toBe(false);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ignore-source file lists a nested node path and the reader reports a path under that nested node as under-ignore-source", async () => {
    await fc.assert(
      fc.asyncProperty(arbNestedNodeSegment, arbSubpath, async (nested, sub) => {
        await withTestEnv(integrationConfig(), async (env) => {
          await writeExclude(env, [nested]);

          const reader = createIgnoreSourceReader(env.productDir, readerConfig());

          expect(reader.isUnderIgnoreSource(spxPath(nested, sub))).toBe(true);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ignore-source file with comments and blank lines parses so only non-comment, non-blank, whitespace-trimmed lines become entries", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(arbNodeSegment, arbNodeSegment, arbNodeSegment)
          .filter(([a, b, c]) => a !== b && b !== c && a !== c),
        arbSubpath,
        async ([segA, segB, segC], sub) => {
          await withTestEnv(integrationConfig(), async (env) => {
            await writeExclude(env, [
              commentHeader(),
              "",
              `  ${segA}  `,
              "",
              commentMiddle(),
              segB,
              "",
            ]);

            const reader = createIgnoreSourceReader(env.productDir, readerConfig());

            expect(reader.isUnderIgnoreSource(spxPath(segA, sub))).toBe(true);
            expect(reader.isUnderIgnoreSource(spxPath(segB, sub))).toBe(true);
            expect(reader.isUnderIgnoreSource(spxPath(segC, sub))).toBe(false);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ignore-source file is absent and the reader reports every path as not-under-ignore-source", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig(), async (env) => {
          const reader = createIgnoreSourceReader(env.productDir, readerConfig());

          expect(reader.isUnderIgnoreSource(spxPath(segment, sub))).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ignore-source file exists but contains no entries after comment and blank stripping and the reader reports every path as not-under-ignore-source", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(integrationConfig(), async (env) => {
          await writeExcludeRaw(env, "");

          const reader = createIgnoreSourceReader(env.productDir, readerConfig());

          expect(reader.isUnderIgnoreSource(spxPath(segment, sub))).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
