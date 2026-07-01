import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RESULT_ERROR_KEY } from "@/config/types";
import { CONFIG_TEST_FIELDS, CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";

describe("config test generators compliance", () => {
  it("keeps generated descriptor validators isolated to their own section values", () => {
    fc.assert(
      fc.property(
        CONFIG_TEST_GENERATOR.tokenDescriptorPair(),
        CONFIG_TEST_GENERATOR.modeDescriptor(),
        ([firstDescriptor, secondDescriptor], modeDescriptor) => {
          const firstResult = firstDescriptor.descriptor.validate({
            ...firstDescriptor.defaults,
            [secondDescriptor.section]: secondDescriptor.defaults,
          });
          expect(firstResult.ok).toBe(true);
          if (firstResult.ok) {
            expect(firstResult.value).toEqual(firstDescriptor.defaults);
          }

          const invalidModeResult = modeDescriptor.descriptor.validate(modeDescriptor.invalid);
          expect(invalidModeResult.ok).toBe(false);
          if (!invalidModeResult.ok) {
            expect(Object.hasOwn(invalidModeResult, RESULT_ERROR_KEY)).toBe(true);
            expect(invalidModeResult.error).toContain(CONFIG_TEST_FIELDS.MODE);
          }
        },
      ),
    );
  });
});
