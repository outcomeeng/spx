import { describe, expect, it } from "vitest";

import { productionRegistry } from "@/config/registry";
import { observeDescriptorDefaults } from "@testing/harnesses/config/descriptor-scope";

describe("resolveConfig — defaults are type-complete", () => {
  it("every registered descriptor's declared defaults round-trip through its own validator", () => {
    const observations = observeDescriptorDefaults(productionRegistry);

    expect(observations).toHaveLength(productionRegistry.length);
    for (const { defaults, roundTrip } of observations) {
      expect(roundTrip.ok).toBe(true);
      if (roundTrip.ok) {
        expect(roundTrip.value).toEqual(defaults);
      }
    }
  });
});
