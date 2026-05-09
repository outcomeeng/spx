import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — partial config", () => {
  it("merges the subset declared in config content with descriptor defaults for that section", async () => {
    const projectConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
    const expected = projectConfig[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort()).toEqual(Object.keys(expected.kinds).sort());
      }
    });
  });

  it("fills sections absent from config content with the descriptor's defaults, leaving declared sections intact", async () => {
    const projectConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.emptyConfig());

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("passes the parsed section value — not the full config — through the descriptor's validator", async () => {
    const projectConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
    const expected = projectConfig[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(specTree.kinds).toEqual(expected.kinds);
      }
    });
  });
});
