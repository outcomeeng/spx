import { describe, it } from "vitest";

import { assertResolutionUsesOnlyCanonicalProductConfig } from "@testing/harnesses/config/resolution";

describe("resolveConfig — resolution scope (C1)", () => {
  it("reads only the config file at the supplied productDir for every config-owned format", async () => {
    await assertResolutionUsesOnlyCanonicalProductConfig();
  });
});
