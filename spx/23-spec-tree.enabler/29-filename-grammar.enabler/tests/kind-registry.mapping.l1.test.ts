import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { kindRegistryMappingCases } from "@testing/generators/spec-tree/filename-grammar";

describe("KIND_REGISTRY", () => {
  it.each(kindRegistryMappingCases())("registers $kind with one category and one suffix", (testCase) => {
    const definition = KIND_REGISTRY[testCase.kind];

    expect(definition.category).toBe(testCase.category);
    expect(definition.suffix).toBe(testCase.suffix);
  });

  it("projects directly from the semantic config object", () => {
    expect(KIND_REGISTRY).toBe(SPEC_TREE_CONFIG.KINDS);
  });
});
