import { describe, expect, it } from "vitest";

import { MINIMAL_SPEC_TREE_CONFIG } from "@testing/generators/config/config";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryDecisionPath, arbitraryNodePath } from "@testing/generators/test-environment/test-environment";

describe("sampleGeneratedValue", () => {
  it("draws the same case from one arbitrary on every call, so a scenario reproduces", () => {
    const arbitrary = arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG);

    expect(sampleGeneratedValue(arbitrary)).toBe(sampleGeneratedValue(arbitrary));
  });

  it("draws from the arbitrary it is given rather than returning one fixed case", () => {
    const nodePath = sampleGeneratedValue(arbitraryNodePath(MINIMAL_SPEC_TREE_CONFIG));
    const decisionPath = sampleGeneratedValue(arbitraryDecisionPath(MINIMAL_SPEC_TREE_CONFIG));

    expect(nodePath).not.toBe(decisionPath);
  });
});
