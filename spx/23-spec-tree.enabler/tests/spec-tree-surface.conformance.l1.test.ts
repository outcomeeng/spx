import { describe, expect, it } from "vitest";

import {
  observePublicSpecTreeSurfaceContract,
  PUBLIC_SPEC_TREE_SURFACE_CONTRACT_FIXTURE_PATH,
} from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree public TypeScript surface", () => {
  it("exports the complete declared consumer contract", () => {
    expect(
      observePublicSpecTreeSurfaceContract(PUBLIC_SPEC_TREE_SURFACE_CONTRACT_FIXTURE_PATH).diagnostics,
    ).toEqual([]);
  });
});
