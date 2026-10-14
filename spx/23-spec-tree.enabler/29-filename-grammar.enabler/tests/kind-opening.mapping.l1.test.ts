import { describe, expect, it } from "vitest";

import { resolveKindOpening } from "@/lib/spec-tree";
import { VARIANT_KIND, variantParentCases } from "@testing/generators/spec-tree/kind-grammar";

describe("variant to opening keyword", () => {
  it.each(variantParentCases())("resolves a variant to the opening keyword of its parent kind: $label", (testCase) => {
    const variantOpening = resolveKindOpening(VARIANT_KIND, testCase.parentKind);

    expect(variantOpening).toBeDefined();
    expect(variantOpening).toBe(resolveKindOpening(testCase.parentKind));
  });
});
