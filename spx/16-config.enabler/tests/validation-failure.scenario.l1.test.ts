import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { RESULT_VALUE_KEY } from "@/config/types";
import {
  CONFIG_TEST_FIELDS,
  CONFIG_TEST_GENERATOR,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — validator rejection", () => {
  it("returns an error naming the descriptor whose validator rejected its section", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const projectConfig: Config = { [generated.section]: generated.invalid };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [generated.descriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(generated.section);
      }
    });
  });

  it("names the offending field within the rejected section", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const projectConfig: Config = { [generated.section]: generated.invalid };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [generated.descriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(CONFIG_TEST_FIELDS.MODE);
      }
    });
  });

  it("returns no partially usable Config when any descriptor rejects — either ok:true with full Config or ok:false with error", async () => {
    const accepted = sampleConfigTestValue(CONFIG_TEST_GENERATOR.tokenDescriptor());
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.modeDescriptor());
    const projectConfig: Config = { [generated.section]: generated.invalid };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [accepted.descriptor, generated.descriptor]);

      if (result.ok) {
        throw new Error("expected validator rejection, got ok:true");
      }
      expect(RESULT_VALUE_KEY in result).toBe(false);
    });
  });
});
