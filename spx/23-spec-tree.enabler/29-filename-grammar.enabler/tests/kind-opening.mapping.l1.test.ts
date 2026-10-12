import { describe, expect, it } from "vitest";

import { resolveKindOpening } from "@/lib/spec-tree";
import { kindOpeningCases } from "@testing/generators/spec-tree/kind-grammar";

describe("node kind to opening keyword", () => {
  it.each(kindOpeningCases())("resolves the opening keyword of $label", (testCase) => {
    expect(resolveKindOpening(testCase.kind, testCase.parentKind)).toBe(testCase.expectedOpening);
  });
});
