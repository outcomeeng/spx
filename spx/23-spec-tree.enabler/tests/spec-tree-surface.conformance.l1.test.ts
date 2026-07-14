import { describe, it } from "vitest";

import { assertPublicSpecTreeSurfaceExportsDeclaredContracts } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree public TypeScript surface", () => {
  it("exports every declared consumer contract from one import boundary", () => {
    assertPublicSpecTreeSurfaceExportsDeclaredContracts();
  });
});
