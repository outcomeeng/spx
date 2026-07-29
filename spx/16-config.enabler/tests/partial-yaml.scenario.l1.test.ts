import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — partial config", () => {
  it("merges the subset declared in config content with descriptor defaults for that section", async () => {
    const projectConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
    const expected = projectConfig[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort(compareAsciiStrings)).toEqual(
          Object.keys(expected.kinds).sort(compareAsciiStrings),
        );
      }
    });
  });

  it("fills sections absent from config content with the descriptor's defaults, leaving declared sections intact", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productionSubsetConfig());
    const projectConfig: Config = generated.config;

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value).sort(compareAsciiStrings)).toEqual(
          productionRegistry.map((descriptor) => descriptor.section).sort(compareAsciiStrings),
        );
        for (const descriptor of productionRegistry) {
          if (!generated.declaredSections.includes(descriptor.section)) {
            expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
          }
        }
        for (const section of generated.declaredSections) {
          expect(result.value).toHaveProperty(section);
        }
      }
    });
  });

  it("passes the parsed section value — not the full config — through the descriptor's validator", async () => {
    const projectConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
    const expected = projectConfig[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(specTree.kinds).toEqual(expected.kinds);
      }
    });
  });
});

describe("resolveConfig — array-shorthand kinds", () => {
  it("accepts `kinds` as an array of registered names and resolves each entry to its full registry definition", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeArrayKindsConfig());
    const projectConfig: Config = generated.config;

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(Object.keys(specTree.kinds).sort(compareAsciiStrings)).toEqual(
          [...generated.selectedKinds].sort(compareAsciiStrings),
        );
        for (const kind of generated.selectedKinds) {
          expect(specTree.kinds[kind]).toEqual(KIND_REGISTRY[kind]);
        }
      }
    });
  });

  it("accepts a single-entry `kinds` array and resolves it to that one registry definition", async () => {
    const [singleKind] = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.specTreeArrayKindsConfig(),
    ).selectedKinds;
    if (singleKind === undefined) {
      throw new Error("specTreeArrayKindsConfig generator returned an empty kinds array");
    }
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: { kinds: [singleKind] },
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const specTree = result.value[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
        expect(specTree.kinds).toEqual({ [singleKind]: KIND_REGISTRY[singleKind] });
      }
    });
  });
});
