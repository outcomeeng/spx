import { describe, expect, it } from "vitest";

import { resolveConfig } from "@/config/index";
import { PATH_FILTER_CONFIG_FIELDS } from "@/config/primitives/path-filter";
import { productionRegistry } from "@/config/registry";
import { RESULT_VALUE_KEY } from "@/config/types";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, type TestingConfig, testingConfigDescriptor } from "@/testing/config";
import {
  VALIDATION_PATHS_SUBSECTION,
  VALIDATION_SECTION,
  validationConfigDescriptor,
} from "@/validation/config/descriptor";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function assertDefinedAndCastTesting(value: unknown): TestingConfig {
  expect(value).toBeDefined();
  return value as TestingConfig;
}

describe("testing config descriptor registration", () => {
  it("registers the testing descriptor through the production config registry", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());

    await withTestEnv(generated.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const testing = assertDefinedAndCastTesting(result.value[TESTING_SECTION]);
        expect(testing[TESTING_CONFIG_FIELDS.PASSING_SCOPE]).toEqual(generated.expected.passingScope);
      }
    });
  });

  it("keeps validation paths and testing passing-scope filters in separate descriptor sections", async () => {
    const validationFilter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());
    const testingFilter = sampleConfigTestValue(CONFIG_TEST_GENERATOR.pathFilter());
    const projectConfig: Config = {
      [VALIDATION_SECTION]: {
        [VALIDATION_PATHS_SUBSECTION]: validationFilter,
      },
      [TESTING_SECTION]: {
        [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: testingFilter,
      },
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [validationConfigDescriptor, testingConfigDescriptor]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const validation = result.value[VALIDATION_SECTION] as typeof validationConfigDescriptor.defaults;
        const testing = assertDefinedAndCastTesting(result.value[TESTING_SECTION]);

        expect(validation.paths[PATH_FILTER_CONFIG_FIELDS.INCLUDE]).toEqual(
          validationFilter[PATH_FILTER_CONFIG_FIELDS.INCLUDE],
        );
        expect(validation.paths[PATH_FILTER_CONFIG_FIELDS.EXCLUDE]).toEqual(
          validationFilter[PATH_FILTER_CONFIG_FIELDS.EXCLUDE],
        );
        expect(testing[TESTING_CONFIG_FIELDS.PASSING_SCOPE][PATH_FILTER_CONFIG_FIELDS.INCLUDE]).toEqual(
          testingFilter[PATH_FILTER_CONFIG_FIELDS.INCLUDE],
        );
        expect(testing[TESTING_CONFIG_FIELDS.PASSING_SCOPE][PATH_FILTER_CONFIG_FIELDS.EXCLUDE]).toEqual(
          testingFilter[PATH_FILTER_CONFIG_FIELDS.EXCLUDE],
        );
      }
    });
  });

  it("rejects malformed testing sections without returning a partial config", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.invalidPathFilter());
    const projectConfig: Config = {
      [TESTING_SECTION]: {
        [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: generated.value,
      },
    };

    await withTestEnv(projectConfig, async ({ productDir }) => {
      const result = await resolveConfig(productDir, productionRegistry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(TESTING_SECTION);
        expect(RESULT_VALUE_KEY in result).toBe(false);
      }
    });
  });
});
