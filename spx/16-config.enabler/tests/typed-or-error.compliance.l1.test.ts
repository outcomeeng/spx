import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { RESULT_VALUE_KEY } from "@/config/types";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — typed-or-error invariant (C4)", () => {
  it("returns ok:true with a fully-typed Config or ok:false with a descriptor-qualified error — never a partial result", async () => {
    const rejectingConfig: Config = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig()).config;

    await withTestEnv(rejectingConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(RESULT_VALUE_KEY in result).toBe(false);
        expect(result.error.length).toBeGreaterThan(0);
      }
    });
  });

  it("on success, the Config contains only descriptor sections — no raw config leakage", async () => {
    const unregisteredSection = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unregisteredField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unregisteredValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const projectConfig: Config = {
      [specTreeConfigDescriptor.section]: { kinds: { enabler: KIND_REGISTRY.enabler } },
      [unregisteredSection]: { [unregisteredField]: unregisteredValue },
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toEqual([specTreeConfigDescriptor.section]);
      }
    });
  });
});
