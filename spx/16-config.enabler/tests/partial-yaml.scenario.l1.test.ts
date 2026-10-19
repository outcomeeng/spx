import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — partial config", () => {
  it("composes each section present in config content through its descriptor", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    await withTestEnv(generated.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir, generated.descriptors);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const declared of generated.declared) {
          expect(result.value[declared.section]).toEqual(declared.override);
        }
      }
    });
  });

  it("resolves every section absent from config content entirely to its descriptor's defaults", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    await withTestEnv(generated.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir, generated.descriptors);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const omitted of generated.omitted) {
          expect(result.value[omitted.section]).toEqual(omitted.defaults);
        }
      }
    });
  });

  it("returns a Config keyed by exactly the descriptors' sections, declared or not", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    await withTestEnv(generated.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir, generated.descriptors);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value).sort(compareAsciiStrings)).toEqual(
          generated.descriptors.map((descriptor) => descriptor.section).sort(compareAsciiStrings),
        );
      }
    });
  });
});
