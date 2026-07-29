import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { productionRegistry } from "@/config/registry";
import { compareAsciiStrings } from "@/lib/state-store";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

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

  it("resolveConfig returns each descriptor's declared defaults when no config overrides apply", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const descriptor of productionRegistry) {
          expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
        }
      }
    });
  });

  it("the resolved Config has one key per registered descriptor — no stray sections", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const keys = Object.keys(result.value).sort(compareAsciiStrings);
        const expected = productionRegistry.map((descriptor) => descriptor.section).sort(compareAsciiStrings);
        expect(keys).toEqual(expected);
      }
    });
  });
});
