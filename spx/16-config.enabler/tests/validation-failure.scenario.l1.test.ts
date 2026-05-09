import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import { specTreeConfigDescriptor } from "@/lib/spec-tree/config";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

describe("resolveConfig — validator rejection", () => {
  it("returns an error naming the descriptor whose validator rejected its section", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
    const projectConfig: Config = generated.config;

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(specTreeConfigDescriptor.section);
      }
    });
  });

  it("names the offending field within the rejected section", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
    const projectConfig: Config = generated.config;

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(generated.offendingKind);
      }
    });
  });

  it("returns no partially usable Config when any descriptor rejects — either ok:true with full Config or ok:false with error", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidSpecTreeConfig());
    const projectConfig: Config = generated.config;

    await withTestEnv(projectConfig, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor]);

      if (result.ok) {
        throw new Error("expected validator rejection, got ok:true");
      }
      expect(sampleConfigTestValue(CONFIG_TEST_GENERATOR.resultValueKey()) in result).toBe(false);
    });
  });
});
