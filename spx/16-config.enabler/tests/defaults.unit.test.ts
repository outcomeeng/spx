import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index.js";
import type { ConfigDescriptor, Result } from "@/config/types.js";
import { specTreeConfigDescriptor } from "@/spec/config.js";
import { withTestEnv } from "@/spec/testing/index.js";

const SECTION_NAMES = ["alpha", "beta", "gamma", "delta"] as const;

type TrivialSectionConfig = { readonly token: string };

function trivialDescriptor(section: string, tokenDefault: string): ConfigDescriptor<TrivialSectionConfig> {
  return {
    section,
    defaults: { token: tokenDefault },
    validate(value: unknown): Result<TrivialSectionConfig> {
      if (typeof value !== "object" || value === null) {
        return { ok: false, error: `${section} must be an object` };
      }
      const candidate = value as { token?: unknown };
      if (typeof candidate.token !== "string") {
        return { ok: false, error: `${section}.token must be a string` };
      }
      return { ok: true, value: { token: candidate.token } };
    },
  };
}

describe("resolveConfig — defaults are type-complete", () => {
  it("every registered descriptor's declared defaults round-trip through its own validator", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...SECTION_NAMES), { minLength: 1, maxLength: SECTION_NAMES.length }),
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: SECTION_NAMES.length }),
        (sections, tokens) => {
          const descriptors = sections.map((section, i) => trivialDescriptor(section, tokens[i % tokens.length]));
          for (const descriptor of descriptors) {
            const roundTrip = descriptor.validate(descriptor.defaults);
            expect(roundTrip.ok).toBe(true);
            if (roundTrip.ok) {
              expect(roundTrip.value).toEqual(descriptor.defaults);
            }
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  it("resolveConfig returns each descriptor's declared defaults when no yaml overrides apply", async () => {
    const descriptors = SECTION_NAMES.slice(0, 3).map((section, i) => trivialDescriptor(section, `default-${i}`));

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
    const descriptors = SECTION_NAMES.map((section, i) => trivialDescriptor(section, `default-${i}`));

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
