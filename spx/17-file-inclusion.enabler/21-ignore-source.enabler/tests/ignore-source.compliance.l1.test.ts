import { describe, expect, it } from "vitest";

import { createExcludeFilter } from "@/exclude/index";
import { withTestEnv } from "@/spec/testing/index";

import {
  COMMENT_HEADER,
  COMMENT_INDENTED,
  INTEGRATION_CONFIG,
  INVALID_EXCLUDE_ENTRIES,
  NODE_SEGMENT_OTHER,
  NODE_SEGMENT_SIMPLE,
  spxPath,
  SUBPATH_IMPL,
  SUBPATH_TEST_SHALLOW,
  writeExclude,
  writeExcludeRaw,
} from "./support";

describe("ignore-source — compliance", () => {
  it("EXCLUDE is append-tolerant: comments, blank lines, and trailing whitespace parse without error", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExclude(env, [
        "",
        COMMENT_HEADER,
        "",
        `   ${NODE_SEGMENT_SIMPLE}   `,
        COMMENT_INDENTED,
        "",
        `${NODE_SEGMENT_OTHER}\t`,
        "",
        "",
      ]);

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_IMPL))).toBe(true);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_OTHER, SUBPATH_TEST_SHALLOW))).toBe(true);
    });
  });

  it("EXCLUDE with only newlines and no entries parses without error and excludes nothing", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExcludeRaw(env, "\n\n\n");

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_IMPL))).toBe(false);
    });
  });

  it("rejects every entry that escapes spx/ at construction time", async () => {
    for (const entry of INVALID_EXCLUDE_ENTRIES) {
      await withTestEnv(INTEGRATION_CONFIG, async (env) => {
        await writeExclude(env, [entry]);

        expect(() => createExcludeFilter(env.projectDir), entry).toThrow();
      });
    }
  });
});
