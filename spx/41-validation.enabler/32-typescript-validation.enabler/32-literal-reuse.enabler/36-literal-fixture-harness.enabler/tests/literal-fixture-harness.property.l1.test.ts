import { describe, expect, it } from "vitest";

import { arbitraryLiteralReuseFixtureInputs } from "@testing/generators/literal/literal";
import { captureReuseFixtureFiles } from "@testing/harnesses/literal/harness";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";

describe("writeReuseFixture", () => {
  it("is deterministic over LiteralReuseFixtureInputs", async () => {
    await assertProperty(
      arbitraryLiteralReuseFixtureInputs(),
      async (inputs) => {
        expect(await captureReuseFixtureFiles(inputs)).toEqual(await captureReuseFixtureFiles(inputs));
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
