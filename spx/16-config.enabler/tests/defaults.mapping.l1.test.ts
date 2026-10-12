import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

describe("resolveConfig — defaults are type-complete", () => {
  it("every registered descriptor's declared defaults round-trip through its own validator", () => {
    const { descriptors } = sampleConfigTestValue(CONFIG_TEST_GENERATOR.descriptorSet());

    for (const descriptor of descriptors) {
      const roundTrip = descriptor.validate(descriptor.defaults);
      expect(roundTrip.ok).toBe(true);
      if (roundTrip.ok) {
        expect(roundTrip.value).toEqual(descriptor.defaults);
      }
    }
  });
});
