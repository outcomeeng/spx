import { describe, expect, it } from "vitest";

import { METHODOLOGY_SECTION } from "@/config/methodology";
import { roundTripMethodologyConfigFormats } from "@testing/harnesses/config/methodology";

describe("methodology config mappings", () => {
  it("resolves equivalent methodology config across supported file formats", () => {
    const { expected, roundTrips } = roundTripMethodologyConfigFormats();

    expect(expected.ok).toBe(true);
    if (!expected.ok) return;

    for (const { format, serialized, resolved } of roundTrips) {
      expect(serialized.ok, format).toBe(true);
      expect(resolved, format).toBeDefined();
      if (resolved === undefined) continue;
      expect(resolved.ok, format).toBe(true);
      if (!resolved.ok) continue;
      expect(resolved.value[METHODOLOGY_SECTION], format).toEqual(expected.value);
    }
  });
});
