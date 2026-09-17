import { describe, expect, it } from "vitest";

import { observePublicSpecTreeSurfaceExportsDeclaredContracts } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree public TypeScript surface", () => {
  it("exports every declared consumer contract from one import boundary", () => {
    const observation = observePublicSpecTreeSurfaceExportsDeclaredContracts();

    expect(observation.diagnostics, observation.formattedDiagnostics).toEqual([]);
  });
});
