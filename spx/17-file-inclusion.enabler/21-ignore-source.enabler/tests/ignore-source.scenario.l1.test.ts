import { describe, expect, it } from "vitest";

import { createExcludeFilter } from "@/exclude/index.js";
import { withTestEnv } from "@/spec/testing/index.js";

import {
  COMMENT_HEADER,
  COMMENT_MIDDLE,
  INTEGRATION_CONFIG,
  NODE_SEGMENT_NESTED,
  NODE_SEGMENT_OTHER,
  NODE_SEGMENT_SIMPLE,
  spxPath,
  SUBPATH_IMPL,
  SUBPATH_TEST_BAR,
  SUBPATH_TEST_FOO,
  writeExclude,
  writeExcludeRaw,
} from "./support.js";

describe("ignore-source — scenarios", () => {
  it("EXCLUDE lists a node path and the filter reports a file inside that node directory as excluded", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExclude(env, [NODE_SEGMENT_SIMPLE]);

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_TEST_FOO))).toBe(true);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_OTHER, SUBPATH_TEST_FOO))).toBe(false);
    });
  });

  it("EXCLUDE lists a nested node path and the filter reports a file inside that nested node as excluded", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExclude(env, [NODE_SEGMENT_NESTED]);

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_NESTED, SUBPATH_TEST_BAR))).toBe(true);
    });
  });

  it("EXCLUDE with comments and blank lines parses so only non-comment, non-blank lines become node paths", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExclude(env, [
        COMMENT_HEADER,
        "",
        NODE_SEGMENT_SIMPLE,
        "",
        COMMENT_MIDDLE,
        NODE_SEGMENT_OTHER,
        "",
      ]);

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_IMPL))).toBe(true);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_OTHER, SUBPATH_IMPL))).toBe(true);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_NESTED, SUBPATH_IMPL))).toBe(false);
    });
  });

  it("EXCLUDE does not exist and the filter constructs so every input path reports as non-excluded", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_IMPL))).toBe(false);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_OTHER, SUBPATH_IMPL))).toBe(false);
    });
  });

  it("EXCLUDE is empty and the filter constructs so every input path reports as non-excluded", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExcludeRaw(env, "");

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_IMPL))).toBe(false);
    });
  });
});
