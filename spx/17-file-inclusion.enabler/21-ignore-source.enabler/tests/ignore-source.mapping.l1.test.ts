import { describe, expect, it } from "vitest";

import { createExcludeFilter } from "@/exclude/index";
import { withTestEnv } from "@/spec/testing/index";

import {
  expectedPytestFlag,
  expectedVitestFlag,
  INTEGRATION_CONFIG,
  NODE_SEGMENT_NESTED,
  NODE_SEGMENT_SIMPLE,
  spxPath,
  SUBPATH_IMPL,
  SUBPATH_TEST_SHALLOW,
  TOOL_PYTEST,
  TOOL_VITEST,
  writeExclude,
} from "./support";

describe("ignore-source — mappings", () => {
  it("a node path segment in EXCLUDE maps to the directory spx/{segment}/ for prefix matching", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExclude(env, [NODE_SEGMENT_SIMPLE]);

      const filter = createExcludeFilter(env.projectDir);

      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_TEST_SHALLOW))).toBe(true);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE, SUBPATH_IMPL))).toBe(true);
      expect(filter.isExcluded(spxPath(NODE_SEGMENT_SIMPLE))).toBe(false);
    });
  });

  it("toToolFlags generates pytest --ignore and vitest --exclude flags for each excluded segment", async () => {
    await withTestEnv(INTEGRATION_CONFIG, async (env) => {
      await writeExclude(env, [NODE_SEGMENT_SIMPLE, NODE_SEGMENT_NESTED]);

      const filter = createExcludeFilter(env.projectDir);

      const pytestFlags = filter.toToolFlags(TOOL_PYTEST);
      expect(pytestFlags).toContain(expectedPytestFlag(NODE_SEGMENT_SIMPLE));
      expect(pytestFlags).toContain(expectedPytestFlag(NODE_SEGMENT_NESTED));

      const vitestFlags = filter.toToolFlags(TOOL_VITEST);
      expect(vitestFlags).toContain(expectedVitestFlag(NODE_SEGMENT_SIMPLE));
      expect(vitestFlags).toContain(expectedVitestFlag(NODE_SEGMENT_NESTED));
    });
  });
});
