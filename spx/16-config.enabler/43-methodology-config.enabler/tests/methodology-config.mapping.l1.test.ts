import { describe, expect, it } from "vitest";

import { METHODOLOGY_SECTION } from "@/config/methodology";
import { observeMethodologyConfigFormatsResolveEquivalently } from "@testing/harnesses/config/methodology";

describe("methodology config mappings", () => {
  it("resolves equivalent methodology config across supported file formats", () => {
    const observation = observeMethodologyConfigFormatsResolveEquivalently();
    expect(observation.expected.ok).toBe(true);
    if (!observation.expected.ok) throw new Error(observation.expected.error);
    for (const format of observation.formats) {
      expect(format.serialized.ok).toBe(true);
      expect(format.parsed?.ok).toBe(true);
      if (format.parsed?.ok === true) {
        expect(format.parsed.value[METHODOLOGY_SECTION]).toEqual(observation.expected.value);
      }
    }
  });
});
