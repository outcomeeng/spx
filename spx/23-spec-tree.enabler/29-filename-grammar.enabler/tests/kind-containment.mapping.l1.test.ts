import { describe, expect, it } from "vitest";

import { resolveAdmittedChildren } from "@/lib/spec-tree";
import { kindAdmittedChildrenCases } from "@testing/generators/spec-tree/kind-grammar";

describe("node kind to admitted child kinds", () => {
  it.each(kindAdmittedChildrenCases())("resolves the child kinds $label admits", (testCase) => {
    const admitted = resolveAdmittedChildren(testCase.kind, testCase.parentKind);

    expect(new Set(admitted)).toEqual(new Set(testCase.expectedChildren));
  });
});
