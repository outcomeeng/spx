import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { RESULT_VALUE_KEY } from "@/config/types";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — typed-or-error invariant (C4)", () => {
  it("returns ok:true with a fully-typed Config or ok:false with a descriptor-qualified error — never a partial result", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const rejectingConfig: Config = { [generated.section]: generated.invalid };

    await withTestEnv(rejectingConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [generated.descriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(RESULT_VALUE_KEY in result).toBe(false);
        expect(result.error).toContain(generated.section);
      }
    });
  });

  it("on success, the Config contains only descriptor sections — no raw config leakage", async () => {
    const [registered, unregistered] = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tokenDescriptorPair());
    const unregisteredField = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unregisteredValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const projectConfig: Config = {
      [registered.section]: registered.defaults,
      [unregistered.section]: { [unregisteredField]: unregisteredValue },
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [registered.descriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.value)).toEqual([registered.section]);
      }
    });
  });
});
