import { describe, it } from "vitest";

import { assertRepresentativeSpecTreeSurfaceScenario } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree stable surface", () => {
  it(
    "reads, projects, and selects the next root by tree order from a representative tree",
    assertRepresentativeSpecTreeSurfaceScenario,
  );
});
