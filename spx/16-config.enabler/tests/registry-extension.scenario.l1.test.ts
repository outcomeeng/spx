import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — registry extension", () => {
  it("exposes a newly registered descriptor's section alongside existing ones, with no change to other descriptors", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const projectConfig: Config = {};

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor, generated.descriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
        expect(result.value[generated.section]).toEqual(generated.defaults);
      }
    });
  });

  it("merges config content for the new descriptor without touching other descriptors' sections", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const projectConfig: Config = {
      [generated.section]: generated.override,
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor, generated.descriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value[generated.section]).toEqual(generated.override);
        expect(result.value[specTreeConfigDescriptor.section]).toEqual(specTreeConfigDescriptor.defaults);
      }
    });
  });

  it("propagates validator errors for a newly added descriptor with descriptor-qualified context", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const projectConfig: Config = {
      [generated.section]: generated.invalid,
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor, generated.descriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(generated.section);
      }
    });
  });
});
