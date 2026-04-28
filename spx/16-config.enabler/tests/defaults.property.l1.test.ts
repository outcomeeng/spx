import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import { specTreeConfigDescriptor } from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";

describe("resolveConfig — defaults are type-complete", () => {
  it("every registered descriptor's declared defaults round-trip through its own validator", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.tokenDescriptors({ minLength: 1, maxLength: 4 }), (generated) => {
        for (const { descriptor } of generated) {
          const roundTrip = descriptor.validate(descriptor.defaults);
          expect(roundTrip.ok).toBe(true);
          if (roundTrip.ok) {
            expect(roundTrip.value).toEqual(descriptor.defaults);
          }
        }
      }),
      { numRuns: 20 },
    );
  });

  it("resolveConfig returns each descriptor's declared defaults when no config overrides apply", async () => {
    const descriptors = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.tokenDescriptors({ minLength: 3, maxLength: 3 }),
    ).map(({ descriptor }) => descriptor);

    await withTestEnv({}, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor, ...descriptors]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const descriptor of descriptors) {
          expect(result.value[descriptor.section]).toEqual(descriptor.defaults);
        }
      }
    });
  });

  it("the resolved Config has one key per registered descriptor — no stray sections", async () => {
    const descriptors = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.tokenDescriptors({ minLength: 4, maxLength: 4 }),
    ).map(({ descriptor }) => descriptor);

    await withTestEnv({}, async ({ projectDir }) => {
      const result = await resolveConfig(projectDir, [specTreeConfigDescriptor, ...descriptors]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const keys = Object.keys(result.value).sort();
        const expected = [specTreeConfigDescriptor.section, ...descriptors.map((d) => d.section)].sort();
        expect(keys).toEqual(expected);
      }
    });
  });
});
