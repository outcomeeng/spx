import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  arbNodeSegment,
  arbSubpath,
  COMMENT_HEADER,
  COMMENT_INDENTED,
  INTEGRATION_CONFIG,
  INVALID_EXCLUDE_ENTRIES,
  PROPERTY_NUM_RUNS,
  READER_CONFIG,
  spxPath,
  writeExclude,
  writeExcludeRaw,
} from "./support";

describe("ignore-source — compliance", () => {
  it("ALWAYS: parsing is append-tolerant — comments, blank lines, and trailing whitespace parse without error", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbNodeSegment, arbNodeSegment).filter(([a, b]) => a !== b),
        arbSubpath,
        async ([segA, segB], sub) => {
          await withTestEnv(INTEGRATION_CONFIG, async (env) => {
            await writeExclude(env, [
              "",
              COMMENT_HEADER,
              "",
              `   ${segA}   `,
              COMMENT_INDENTED,
              "",
              `${segB}\t`,
              "",
              "",
            ]);

            const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);

            expect(reader.isUnderIgnoreSource(spxPath(segA, sub))).toBe(true);
            expect(reader.isUnderIgnoreSource(spxPath(segB, sub))).toBe(true);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ALWAYS: append-tolerant — file with only newlines and no entries parses without error and excludes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(INTEGRATION_CONFIG, async (env) => {
          await writeExcludeRaw(env, "\n\n\n");

          const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);

          expect(reader.isUnderIgnoreSource(spxPath(segment, sub))).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("ALWAYS: entries that escape the configured spec-tree root segment cause construction to fail with an error naming the offending entry and the parse position", async () => {
    for (const entry of INVALID_EXCLUDE_ENTRIES) {
      await withTestEnv(INTEGRATION_CONFIG, async (env) => {
        await writeExclude(env, [entry]);

        const throws = () => createIgnoreSourceReader(env.projectDir, READER_CONFIG);
        expect(throws, entry).toThrow(entry);
        expect(throws, entry).toThrow("at line 1");
      });
    }
  });
});
