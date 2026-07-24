import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — registry extension", () => {
  it("exposes a newly registered descriptor's section alongside existing ones, with no change to other descriptors", async () => {
    const projectConfig: Config = {};

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const descriptor of productionRegistry) {
          expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
        }
      }
    });
  });

  it("merges config content for the new descriptor without touching other descriptors' sections", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productionSubsetConfig());
    const projectConfig: Config = generated.config;

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const descriptor of productionRegistry) {
          if (!generated.declaredSections.includes(descriptor.section)) {
            expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
          }
        }
        for (const section of generated.declaredSections) {
          expect(result.value[section]).toEqual(generated.config[section]);
        }
      }
    });
  });

  it("propagates validator errors for a newly added descriptor with descriptor-qualified context", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
    const projectConfig: Config = {
      ...generated.config,
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(specTreeConfigDescriptor.section);
        expect(result.error).toContain(generated.offendingKind);
      }
    });
  });
});
