import { describe, expect, it } from "vitest";

import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { forEachResolutionScopeObservation } from "@testing/harnesses/config/resolution";

describe("resolveConfig — resolution scope (C1)", () => {
  it("reads only the config file at the supplied productDir for every config-owned format", async () => {
    await forEachResolutionScopeObservation(({ expectedKinds, result }) => {
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const resolved = specTreeConfigDescriptor.validate(result.value[specTreeConfigDescriptor.section]);
      expect(resolved.ok).toBe(true);
      if (resolved.ok) expect(Object.keys(resolved.value.kinds)).toEqual(expectedKinds);
    });
  });
});
