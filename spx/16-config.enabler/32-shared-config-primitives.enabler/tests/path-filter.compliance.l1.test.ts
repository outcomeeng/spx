import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";
import { VALIDATION_PATHS_SUBSECTION, VALIDATION_SECTION } from "@/validation/config/descriptor";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

type GeneratedPathFilterSection = {
  readonly [VALIDATION_PATHS_SUBSECTION]: PathFilterConfig;
};

function isGeneratedPathFilterSection(
  value: unknown,
): value is { readonly [VALIDATION_PATHS_SUBSECTION]?: unknown } {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

function buildPathFilterDescriptor(section: string): ConfigDescriptor<GeneratedPathFilterSection> {
  return {
    section,
    defaults: { [VALIDATION_PATHS_SUBSECTION]: {} },
    validate(value: unknown): Result<GeneratedPathFilterSection> {
      if (!isGeneratedPathFilterSection(value)) {
        const result = validatePathFilterConfig(value, section);
        if (!result.ok) return result;
        return { ok: false, error: section };
      }
      const filterResult = validatePathFilterConfig(
        value[VALIDATION_PATHS_SUBSECTION] ?? {},
        `${section}.${VALIDATION_PATHS_SUBSECTION}`,
      );
      if (!filterResult.ok) return filterResult;
      return {
        ok: true,
        value: { [VALIDATION_PATHS_SUBSECTION]: filterResult.value },
      };
    },
  };
}

describe("path filter primitive compliance", () => {
  it("rejects invalid generated filters with path-qualified errors", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.invalidPathFilter(), (invalid) => {
        const result = validatePathFilterConfig(invalid.value, invalid.path);

        expect(result).toEqual({ ok: false, error: invalid.error });
      }),
    );
  });

  it("normalizes empty filters without adding domain policy defaults", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const result = validatePathFilterConfig({}, path);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: undefined,
        [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: undefined,
      });
    }
  });

  it("lets separate descriptors expose the same structure under separate sections", () => {
    const firstSection = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.key().filter((section) => section !== VALIDATION_SECTION),
    );
    const secondSection = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.key().filter((section) => section !== VALIDATION_SECTION && section !== firstSection),
    );
    const firstDescriptor = buildPathFilterDescriptor(firstSection);
    const secondDescriptor = buildPathFilterDescriptor(secondSection);
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());

    const firstResult = firstDescriptor.validate({ [VALIDATION_PATHS_SUBSECTION]: filter });
    const secondResult = secondDescriptor.validate({ [VALIDATION_PATHS_SUBSECTION]: filter });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (firstResult.ok && secondResult.ok) {
      expect(firstResult.value).toEqual(secondResult.value);
    }
  });
});
