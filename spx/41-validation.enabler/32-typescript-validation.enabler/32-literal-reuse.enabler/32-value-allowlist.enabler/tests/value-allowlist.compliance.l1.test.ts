import { describe, expect, it } from "vitest";

import { PRESET_NAMES, resolveAllowlist } from "@/validation/literal/config";
import {
  arbitraryDomainLiteral,
  LITERAL_TEST_GENERATOR,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";

describe("ALWAYS: exclude removes a value from the effective allowlist regardless of which source contributed it", () => {
  it("a value contributed via include is removed when listed in exclude", () => {
    const v = sampleLiteralTestValue(arbitraryDomainLiteral());

    const effective = resolveAllowlist({ include: [v], exclude: [v] });

    expect(effective.has(v)).toBe(false);
  });

  it("a value contributed via preset is removed when listed in exclude", () => {
    const webToken = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.webPresetToken());

    const effective = resolveAllowlist({
      presets: [PRESET_NAMES.WEB],
      exclude: [webToken],
    });

    expect(effective.has(webToken)).toBe(false);
  });
});
