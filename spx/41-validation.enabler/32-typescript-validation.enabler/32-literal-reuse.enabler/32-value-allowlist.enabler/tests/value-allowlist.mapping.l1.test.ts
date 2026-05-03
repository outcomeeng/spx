import { describe, expect, it } from "vitest";

import { PRESET_NAMES, resolveAllowlist, WEB_PRESET_TOKENS } from "@/validation/literal/config";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

describe("value-allowlist — mappings", () => {
  describe("effective allowlist = union(preset bundles) ∪ include \\ exclude", () => {
    it("only include: effective set contains exactly the included values", () => {
      const v = sampleLiteralTestValue(arbitraryDomainLiteral());

      const effective = resolveAllowlist({ include: [v] });

      expect(effective.has(v)).toBe(true);
    });

    it("only preset: effective set contains the preset bundle", () => {
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      const effective = resolveAllowlist({ presets: [PRESET_NAMES.WEB] });

      expect(effective.has(webToken)).toBe(true);
    });

    it("preset + include: effective set contains both the preset bundle and the included values", () => {
      const v = sampleLiteralTestValue(arbitraryDomainLiteral());
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      const effective = resolveAllowlist({ presets: [PRESET_NAMES.WEB], include: [v] });

      expect(effective.has(v)).toBe(true);
      expect(effective.has(webToken)).toBe(true);
    });

    it("include + exclude: excluded value is absent from the effective set", () => {
      const v = sampleLiteralTestValue(arbitraryDomainLiteral());

      const effective = resolveAllowlist({ include: [v], exclude: [v] });

      expect(effective.has(v)).toBe(false);
    });

    it("preset + exclude: excluded token is absent from the effective set", () => {
      const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

      const effective = resolveAllowlist({ presets: [PRESET_NAMES.WEB], exclude: [webToken] });

      expect(effective.has(webToken)).toBe(false);
    });
  });

  describe("built-in preset web bundles all registered tokens", () => {
    it.each(WEB_PRESET_TOKENS)(
      "web preset contains %s",
      (token) => {
        const effective = resolveAllowlist({ presets: [PRESET_NAMES.WEB] });

        expect(effective.has(token)).toBe(true);
      },
    );
  });
});
