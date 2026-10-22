import { describe, expect, it } from "vitest";

import { classifySpecTreePath, SPEC_TREE_CONFORMANCE_VERDICT } from "@/lib/spec-tree";
import { recognizedPathCases } from "@testing/generators/spec-tree/skill-conformance";
import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";

describe("skill-conformance oracle recognized forms", () => {
  it.each(recognizedPathCases())(SPEC_TREE_CASE_TITLE, (testCase) => {
    expect(classifySpecTreePath(testCase.record, testCase.context, testCase.options)).not.toBe(
      SPEC_TREE_CONFORMANCE_VERDICT.FOREIGN,
    );
  });
});
