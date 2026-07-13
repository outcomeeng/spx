import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { RESULT_VALUE_KEY } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

export function registerConfigValidationFailureScenarios(): void {
  describe("resolveConfig — validator rejection", () => {
    it("returns an error naming the descriptor whose validator rejected its section", async () => {
      const generated = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.invalidSpecTreeConfig(),
      );
      const projectConfig: Config = generated.config;

      await withTestEnv(projectConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(specTreeConfigDescriptor.section);
        }
      });
    });

    it("names the offending field within the rejected section", async () => {
      const generated = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.invalidSpecTreeConfig(),
      );
      const projectConfig: Config = generated.config;

      await withTestEnv(projectConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain(generated.offendingKind);
        }
      });
    });

    it("returns no partially usable Config when any descriptor rejects — either ok:true with full Config or ok:false with error", async () => {
      const generated = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.invalidSpecTreeConfig(),
      );
      const projectConfig: Config = generated.config;

      await withTestEnv(projectConfig, async ({ productDir }) => {
        const result = await resolveConfig(productDir, [
          specTreeConfigDescriptor,
        ]);

        if (result.ok) {
          throw new Error("expected validator rejection, got ok:true");
        }
        expect(RESULT_VALUE_KEY in result).toBe(false);
      });
    });
  });
}
