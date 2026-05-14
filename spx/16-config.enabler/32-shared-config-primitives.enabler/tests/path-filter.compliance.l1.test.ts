import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import type { ConfigDescriptor, Result } from "@/config/types";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

type GeneratedPathFilterSection = Readonly<Record<string, PathFilterConfig>>;

function isGeneratedPathFilterSection(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return value instanceof Object && !Array.isArray(value);
}

function buildPathFilterDescriptor(section: string, field: string): ConfigDescriptor<GeneratedPathFilterSection> {
  return {
    section,
    defaults: { [field]: {} },
    validate(value: unknown): Result<GeneratedPathFilterSection> {
      if (!isGeneratedPathFilterSection(value)) {
        return { ok: false, error: section };
      }
      const filterResult = validatePathFilterConfig(value[field] ?? {}, `${section}.${field}`);
      if (!filterResult.ok) return filterResult;
      return {
        ok: true,
        value: { [field]: filterResult.value },
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

  it("ignores generated unknown keys without turning them into filter output", () => {
    const path = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unknownKey = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const unknownValue = sampleConfigTestValue(CONFIG_TEST_GENERATOR.scalar());
    const result = validatePathFilterConfig({ [unknownKey]: unknownValue }, path);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: undefined,
        [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: undefined,
      });
    }
  });

  it("lets separate descriptors expose the same structure under separate sections", () => {
    const field = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const firstSection = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const secondSection = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.key().filter((section) => section !== firstSection),
    );
    const firstDescriptor = buildPathFilterDescriptor(firstSection, field);
    const secondDescriptor = buildPathFilterDescriptor(secondSection, field);
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());

    const firstResult = firstDescriptor.validate({ [field]: filter });
    const secondResult = secondDescriptor.validate({ [field]: filter });

    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
    if (firstResult.ok && secondResult.ok) {
      expect(firstResult.value).toEqual(secondResult.value);
    }
  });
});
