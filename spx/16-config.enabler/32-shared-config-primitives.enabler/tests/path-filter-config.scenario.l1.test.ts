import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS, type PathFilterConfig } from "@/config/primitives/path-filter";
import { VALIDATION_PATHS_SUBSECTION, VALIDATION_SECTION, type ValidationConfig } from "@/validation/config/descriptor";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function normalizePathFilter(filter: PathFilterConfig): PathFilterConfig {
  return {
    [PATH_FILTER_CONFIG_FIELDS.INCLUDE]: filter[PATH_FILTER_CONFIG_FIELDS.INCLUDE],
    [PATH_FILTER_CONFIG_FIELDS.EXCLUDE]: filter[PATH_FILTER_CONFIG_FIELDS.EXCLUDE],
  };
}

describe("path filter config resolution", () => {
  it("resolves validation path filters from a real product config file through the production registry", async () => {
    const filter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());

    await withTestEnv(
      {
        [VALIDATION_SECTION]: {
          [VALIDATION_PATHS_SUBSECTION]: filter,
        },
      },
      async ({ productDir }) => {
        const result = await resolveConfig(productDir);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const validation = result.value[VALIDATION_SECTION] as ValidationConfig;
          expect(validation.paths).toMatchObject(normalizePathFilter(filter));
        }
      },
    );
  });
});
