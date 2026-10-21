import { describe, expect, it } from "vitest";

import { classifySpecTreePath } from "@/lib/spec-tree";
import { specFileCases } from "@testing/generators/spec-tree/skill-conformance";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";

describe("skill-conformance oracle spec files", () => {
  it.each(specFileCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    expect(classifySpecTreePath(testCase.record, testCase.context, testCase.options)).toBe(testCase.verdict);
  });
});
