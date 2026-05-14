import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  PATH_FILTER_CONFIG_FIELDS,
  type PathFilterConfig,
  validatePathFilterConfig,
} from "@/config/primitives/path-filter";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";

function normalizePathFilter(filter: PathFilterConfig): PathFilterConfig {
  return {
    [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: filter[PATH_FILTER_CONFIG_FIELDS.INCLUDE],
    [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: filter[PATH_FILTER_CONFIG_FIELDS.EXCLUDE],
  };
}

describe("path filter primitive", () => {
  it("preserves generated include/exclude arrays and omitted fields for valid filters", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.pathFilter(), CONFIG_TEST_GENERATOR.key(), (filter, path) => {
        const result = validatePathFilterConfig(filter, path);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(normalizePathFilter(filter));
        }
      }),
    );
  });
});
