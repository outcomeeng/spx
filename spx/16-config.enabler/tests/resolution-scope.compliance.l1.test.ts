import { describe, it } from "vitest";

import {
  assertEveryConfigFormatSupportsReadParseSerialize,
  assertResolutionUsesOnlyCanonicalProductConfig,
} from "@testing/harnesses/config/resolution";

describe("resolveConfig — resolution scope (C1)", () => {
  it("reads only the config file at the supplied productDir for every config-owned format", async () => {
    await assertResolutionUsesOnlyCanonicalProductConfig();
  });

  it("exposes config-owned read, parse, and serialize APIs for every declared config format", async () => {
    await assertEveryConfigFormatSupportsReadParseSerialize();
  });
});
