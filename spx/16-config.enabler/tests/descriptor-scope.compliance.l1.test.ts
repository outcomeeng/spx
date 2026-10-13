import { describe, expect, it } from "vitest";

import { CONFIG_TEST_FIELDS } from "@testing/generators/config/descriptors";
import { forEachProductionSectionShadowObservation } from "@testing/harnesses/config/descriptor-scope";

describe("resolveConfig — generated descriptors decide config-module results", () => {
  it("defaults, composition, and rejection follow the generated descriptor registered under each production section, not the production descriptor", async () => {
    await forEachProductionSectionShadowObservation((observation) => {
      const { section, shadow } = observation;

      expect(observation.scopedDefaulted.ok).toBe(true);
      if (observation.scopedDefaulted.ok) {
        expect(observation.scopedDefaulted.value[section]).toEqual(shadow.defaults);
      }

      expect(observation.scopedComposed.ok).toBe(true);
      if (observation.scopedComposed.ok) {
        expect(observation.scopedComposed.value[section]).toEqual(shadow.override);
      }

      expect(observation.scopedRejected.ok).toBe(false);
      if (!observation.scopedRejected.ok) {
        expect(observation.scopedRejected.error).toContain(section);
        expect(observation.scopedRejected.error).toContain(CONFIG_TEST_FIELDS.MODE);
      }
    });
  });

  it("resolution through the production registry yields results the generated descriptor's rules do not (the violating shape is detectable)", async () => {
    await forEachProductionSectionShadowObservation((observation) => {
      const { section, shadow } = observation;

      expect(observation.unscopedDefaulted.ok ? observation.unscopedDefaulted.value[section] : undefined)
        .not.toEqual(shadow.defaults);
      expect(observation.unscopedComposed.ok ? observation.unscopedComposed.value[section] : undefined)
        .not.toEqual(shadow.override);
    });
  });
});
