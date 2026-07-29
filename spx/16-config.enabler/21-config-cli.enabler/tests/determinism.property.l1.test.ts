import { describe, expect, it } from "vitest";

import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { observeConfigHandlerDeterminism } from "@testing/harnesses/config/cli";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("config command determinism", () => {
  it("returns identical results for identical dependencies and format options", async () => {
    await assertProperty(
      CONFIG_TEST_GENERATOR.configCliDeterminismCase(),
      async (generated) => {
        const { defaults, defaultsAgain, show, showAgain, validate, validateAgain } =
          await observeConfigHandlerDeterminism(generated);
        expect(show).toEqual(showAgain);
        expect(validate).toEqual(validateAgain);
        expect(defaults).toEqual(defaultsAgain);
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
