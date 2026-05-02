import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createIgnoreSourceReader,
  IGNORE_SOURCE_FILENAME_DEFAULT,
  type IgnoreSourceReaderConfig,
} from "@/lib/file-inclusion/ignore-source";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

import {
  arbNestedNodeSegment,
  arbNodeSegment,
  arbSubpath,
  INTEGRATION_CONFIG,
  PROPERTY_NUM_RUNS,
  READER_CONFIG,
  spxPath,
  writeExclude,
} from "./support";

describe("ignore-source — mappings", () => {
  it("an entry segment in the ignore-source file maps to the directory {specTreeRootSegment}/{segment}/ for prefix matching", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(INTEGRATION_CONFIG, async (env) => {
          await writeExclude(env, [segment]);

          const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);

          expect(reader.isUnderIgnoreSource(spxPath(segment, sub))).toBe(true);
          // directory path without trailing separator does not match
          expect(reader.isUnderIgnoreSource(spxPath(segment))).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("entries() returns the parsed segments from the ignore-source file", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbNestedNodeSegment, async (simple, nested) => {
        await withTestEnv(INTEGRATION_CONFIG, async (env) => {
          await writeExclude(env, [simple, nested]);

          const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);

          const segments = reader.entries().map((e) => e.segment);
          expect(segments).toContain(simple);
          expect(segments).toContain(nested);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("matchedEntry returns the IgnoreSourceEntry whose segment matches the path's directory prefix", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(arbNodeSegment, arbNodeSegment).filter(([a, b]) => a !== b),
        arbSubpath,
        async ([matched, other], sub) => {
          await withTestEnv(INTEGRATION_CONFIG, async (env) => {
            await writeExclude(env, [matched, other]);

            const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);
            const path = spxPath(matched, sub);

            const entry = reader.matchedEntry(path);
            expect(entry, `matchedEntry("${path}") defined`).toBeDefined();
            expect(entry?.segment, `segment for "${path}"`).toBe(matched);
          });
        },
      ),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("matchedEntry returns undefined when the path is not under any listed entry", async () => {
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(INTEGRATION_CONFIG, async (env) => {
          await writeExclude(env, [segment]);

          const reader = createIgnoreSourceReader(env.projectDir, READER_CONFIG);
          const unrelatedPath = `other-root/${segment}/${sub}`;

          const entry = reader.matchedEntry(unrelatedPath);
          expect(entry, `matchedEntry("${unrelatedPath}") undefined`).toBeUndefined();
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });

  it("specTreeRootSegment comes from the reader config, not hardcoded — a different segment prefix produces a different match domain", async () => {
    const altRootSegment = "alt-root";
    const altConfig: IgnoreSourceReaderConfig = {
      ignoreSourceFilename: IGNORE_SOURCE_FILENAME_DEFAULT,
      specTreeRootSegment: altRootSegment,
    };
    await fc.assert(
      fc.asyncProperty(arbNodeSegment, arbSubpath, async (segment, sub) => {
        await withTestEnv(INTEGRATION_CONFIG, async (env) => {
          await env.writeRaw(`${altRootSegment}/${IGNORE_SOURCE_FILENAME_DEFAULT}`, segment);

          const reader = createIgnoreSourceReader(env.projectDir, altConfig);

          expect(reader.isUnderIgnoreSource(`${altRootSegment}/${segment}/${sub}`)).toBe(true);
          expect(reader.isUnderIgnoreSource(spxPath(segment, sub))).toBe(false);
        });
      }),
      { numRuns: PROPERTY_NUM_RUNS },
    );
  });
});
