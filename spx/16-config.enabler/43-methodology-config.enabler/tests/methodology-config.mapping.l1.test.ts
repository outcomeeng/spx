import { describe, it } from "vitest";

import { assertMethodologyConfigFormatsResolveEquivalently } from "@testing/harnesses/config/methodology";

describe("methodology config mappings", () => {
  it("resolves equivalent methodology config across supported file formats", () => {
    assertMethodologyConfigFormatsResolveEquivalently();
  });
});
