import { describe, expect, it } from "vitest";

import { forEachResolutionScopeObservation } from "@testing/harnesses/config/resolution";

describe("resolveConfig — resolution scope (C1)", () => {
  it("reads only the config file at the supplied productDir for every config-owned format", async () => {
    await forEachResolutionScopeObservation(({ expectedSection, result, section }) => {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[section]).toEqual(expectedSection);
    });
  });
});
