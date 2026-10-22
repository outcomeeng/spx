import { describe, expect, it } from "vitest";

import { classifySpecTreePath } from "@/lib/spec-tree";
import { formPathCases, unrecognizedPathCases } from "@testing/generators/spec-tree/skill-conformance";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";

describe("skill-conformance oracle path forms", () => {
  it.each(formPathCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    expect(classifySpecTreePath(testCase.record, testCase.context, testCase.options)).toBe(testCase.verdict);
  });

  it.each(unrecognizedPathCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    expect(classifySpecTreePath(testCase.record, testCase.context, testCase.options)).toBe(testCase.verdict);
  });
});
