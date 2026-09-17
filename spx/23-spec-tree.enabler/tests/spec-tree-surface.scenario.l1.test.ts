import { describe, expect, it } from "vitest";

import { observeRepresentativeSpecTreeSurfaceScenario } from "@testing/harnesses/spec-tree/public-surface";

describe("spec-tree stable surface", () => {
  it("reads, projects, and selects the next root by tree order from a representative tree", async () => {
    const observation = await observeRepresentativeSpecTreeSurfaceScenario();

    expect(observation.actual).toEqual(observation.expected);
  });
});
