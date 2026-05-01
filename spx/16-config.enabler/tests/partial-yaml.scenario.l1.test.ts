import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES, resolveConfig } from "@/config/index";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — partial config", () => {
  it("merges the subset declared in config content with descriptor defaults for that section", async () => {
    const selectedKinds = ["enabler", "adr"] as const;

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await writeRaw(CONFIG_FILENAMES.yaml, "specTree:\n  kinds:\n    - enabler\n    - adr\n");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort()).toEqual([...selectedKinds].sort());
      }
    });
  });

  it("fills sections absent from config content with the descriptor's defaults, leaving declared sections intact", async () => {
    const projectConfig: Config = {};

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("passes the parsed section value — not the full config — through the descriptor's validator", async () => {
    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await writeRaw(CONFIG_FILENAMES.yaml, "specTree:\n  kinds:\n    - pdr\n");

      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(specTree.kinds).toEqual({ pdr: KIND_REGISTRY.pdr });
      }
    });
  });
});
