import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, SPEC_TREE_CONFIG, SPEC_TREE_KIND_CATEGORY } from "@/lib/spec-tree";
import { kindRegistryMappingCases } from "@testing/generators/spec-tree/filename-grammar";

describe("KIND_REGISTRY", () => {
  it.each(kindRegistryMappingCases())("registers $kind with one category and one suffix", (testCase) => {
    const definition = KIND_REGISTRY[testCase.kind];

    expect(Object.values(SPEC_TREE_KIND_CATEGORY)).toContain(definition.category);
    expect(definition.label.length).toBeGreaterThan(0);
    expect(Array.isArray(definition.aliases)).toBe(true);
    expect(definition.suffix).toMatch(testCase.suffixPattern);
  });

  it("projects directly from the semantic config object", () => {
    expect(KIND_REGISTRY).toBe(SPEC_TREE_CONFIG.KINDS);
  });
});
