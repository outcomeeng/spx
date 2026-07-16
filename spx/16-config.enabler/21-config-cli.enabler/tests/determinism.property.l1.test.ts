import { describe, expect, it } from "vitest";

import { forEachConfigHandlerDeterminismObservation } from "@testing/harnesses/config/cli";

describe("config command determinism", () => {
  it("returns identical results for identical dependencies and format options", async () => {
    await forEachConfigHandlerDeterminismObservation(({
      defaults,
      defaultsAgain,
      show,
      showAgain,
      validate,
      validateAgain,
    }) => {
      expect(show).toEqual(showAgain);
      expect(validate).toEqual(validateAgain);
      expect(defaults).toEqual(defaultsAgain);
    });
  });
});
