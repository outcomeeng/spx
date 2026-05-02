import { describe, expect, it } from "vitest";

import { REGISTERED_TOOL_NAMES, TOOL_DEFAULT_FLAGS, toToolArguments } from "@/lib/file-inclusion/adapters";

import { makeScope, makeToolAdaptersConfig, sampleExcludedPath } from "./support";

describe("tool adapters — mappings", () => {
  it.each(Object.entries(TOOL_DEFAULT_FLAGS))(
    "tool %s is registered and maps excluded path to [%s, path] pair",
    (toolName, ignoreFlag) => {
      expect(REGISTERED_TOOL_NAMES, `adapters.mapping: "${toolName}" not in REGISTERED_TOOL_NAMES`).toContain(toolName);

      const scope = makeScope([sampleExcludedPath]);
      const config = makeToolAdaptersConfig({ [toolName]: ignoreFlag });

      const result = toToolArguments(scope, toolName, config);

      const idx = result.indexOf(sampleExcludedPath);
      expect(idx, `adapters.mapping: "${sampleExcludedPath}" absent from args`).toBeGreaterThanOrEqual(0);
      expect(result[idx - 1], `adapters.mapping: "${ignoreFlag}" not before path`).toBe(ignoreFlag);
    },
  );
});
