import { describe, expect, it } from "vitest";

import { productionRegistry } from "@/config/registry";

describe("resolveConfig — defaults are type-complete", () => {
  it("every registered descriptor's declared defaults round-trip through its own validator", () => {
    for (const descriptor of productionRegistry) {
      const roundTrip = descriptor.validate(descriptor.defaults);
      expect(roundTrip.ok).toBe(true);
      if (roundTrip.ok) {
        expect(roundTrip.value).toEqual(descriptor.defaults);
      }
    }
  });
});
