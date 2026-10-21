import { describe, expect, it } from "vitest";

import { classifySpecTreePath } from "@/lib/spec-tree";
import { knowledgeProbeMappingCases } from "@testing/generators/spec-tree/skill-conformance";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";

describe("skill-conformance oracle knowledge roots and probe directories", () => {
  it.each(knowledgeProbeMappingCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    expect(classifySpecTreePath(testCase.record, testCase.context, testCase.options)).toBe(testCase.verdict);
  });
});
