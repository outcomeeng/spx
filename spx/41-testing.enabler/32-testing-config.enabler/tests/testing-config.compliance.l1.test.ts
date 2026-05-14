import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { PATH_FILTER_CONFIG_FIELDS, validatePathFilterConfig } from "@/config/primitives/path-filter";
import { TESTING_CONFIG_FIELDS, TESTING_SECTION, type TestingConfig, testingConfigDescriptor } from "@/testing/config";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";

function expectTestingConfig(result: ReturnType<typeof testingConfigDescriptor.validate>): TestingConfig {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

describe("testing config descriptor", () => {
  it("resolves omitted passing-scope policy to descriptor defaults", () => {
    const result = testingConfigDescriptor.validate({});

    expectTestingConfig(result);
    expect(result).toEqual({
      ok: true,
      value: testingConfigDescriptor.defaults,
    });
  });

  it("accepts generated passing-scope path filters through the shared primitive", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.pathFilter(), (filter) => {
        const result = testingConfigDescriptor.validate({
          [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: filter,
        });
        const primitiveResult = validatePathFilterConfig(
          filter,
          `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
        );

        expect(primitiveResult.ok).toBe(true);
        if (primitiveResult.ok) {
          expect(result).toEqual({
            ok: true,
            value: {
              [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: primitiveResult.value,
            },
          });
        }
      }),
    );
  });

  it("rejects an explicit null passing-scope value instead of treating it as omitted", () => {
    const path = `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`;
    const result = testingConfigDescriptor.validate({
      [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: null,
    });
    const primitiveResult = validatePathFilterConfig(null, path);

    expect(primitiveResult.ok).toBe(false);
    if (!primitiveResult.ok) {
      expect(result).toEqual(primitiveResult);
    }
  });

  it("rejects invalid passing-scope path filters with descriptor-qualified paths", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.invalidPathFilter(), (generated) => {
        const result = testingConfigDescriptor.validate({
          [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: generated.value,
        });
        const expectedPath = generated.error.replace(
          generated.path,
          `${TESTING_SECTION}.${TESTING_CONFIG_FIELDS.PASSING_SCOPE}`,
        );

        expect(result).toEqual({ ok: false, error: expectedPath });
      }),
    );
  });

  it("keeps passing-scope include and exclude fields independent", () => {
    fc.assert(
      fc.property(CONFIG_TEST_GENERATOR.pathFilter(), (filter) => {
        const result = expectTestingConfig(
          testingConfigDescriptor.validate({
            [TESTING_CONFIG_FIELDS.PASSING_SCOPE]: filter,
          }),
        );

        expect(result[TESTING_CONFIG_FIELDS.PASSING_SCOPE][PATH_FILTER_CONFIG_FIELDS.INCLUDE]).toEqual(
          filter[PATH_FILTER_CONFIG_FIELDS.INCLUDE],
        );
        expect(result[TESTING_CONFIG_FIELDS.PASSING_SCOPE][PATH_FILTER_CONFIG_FIELDS.EXCLUDE]).toEqual(
          filter[PATH_FILTER_CONFIG_FIELDS.EXCLUDE],
        );
      }),
    );
  });
});
