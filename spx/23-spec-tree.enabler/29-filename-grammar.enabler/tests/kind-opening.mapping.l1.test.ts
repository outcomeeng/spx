import { describe, expect, it } from "vitest";

import { KIND_REGISTRY, resolveKindOpening } from "@/lib/spec-tree";
import { kindOpeningCases, VARIANT_KIND, variantParentCases } from "@testing/generators/spec-tree/kind-grammar";

describe("node kind to opening keyword", () => {
  it.each(kindOpeningCases())("resolves $label to its opening keyword", (testCase) => {
    expect(resolveKindOpening(testCase.kind)).toBe(testCase.expectedOpening);
  });
});

describe("variant to opening keyword", () => {
  it.each(variantParentCases())("resolves a variant to the opening keyword of its parent kind: $label", (testCase) => {
    const variantOpening = resolveKindOpening(VARIANT_KIND, testCase.parentKind);

    expect(variantOpening).toBe(KIND_REGISTRY[testCase.parentKind].opening);
  });
});
