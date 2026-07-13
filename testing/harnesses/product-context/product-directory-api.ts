import { describe, expect, it } from "vitest";

import { LEGACY_PRODUCT_ROOT_FIELD_NAMES, resolveProductDir } from "@/domains/config/root";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

export function registerProductDirectoryApiCompliance(): void {
  describe("product directory API vocabulary", () => {
    it("resolveProductDir exposes productDir without legacy root aliases", async () => {
      const cwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const gitToplevel = sampleConfigTestValue(
        CONFIG_TEST_GENERATOR.productDir(),
      );

      const result = resolveProductDir(cwd, {
        readGitToplevel: () => gitToplevel,
      });

      expect(result).toEqual({ productDir: gitToplevel });
      for (const legacyField of LEGACY_PRODUCT_ROOT_FIELD_NAMES) {
        expect(legacyField in result).toBe(false);
      }
    });

    it("resolveProductDir fallback exposes productDir without legacy root aliases", async () => {
      const cwd = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());

      const result = resolveProductDir(cwd, {
        readGitToplevel: () => undefined,
      });

      expect(result.productDir).toBe(cwd);
      expect(result.warning).toContain(cwd);
      for (const legacyField of LEGACY_PRODUCT_ROOT_FIELD_NAMES) {
        expect(legacyField in result).toBe(false);
      }
    });
  });
}
