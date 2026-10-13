import { describe, expect, it } from "vitest";

import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import {
  lintPolicyAcceptedSuffixCases,
  lintPolicyRejectedSuffixCases,
} from "@testing/generators/validation/lint-policy";
import { observeLintPolicyOfProduct } from "@testing/harnesses/validation/lint-policy";

describe("lint policy rejects a spec node directory only when no selected naming-schema version accepts its suffix", () => {
  it.each(lintPolicyAcceptedSuffixCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    const result = await observeLintPolicyOfProduct({
      declaredLine: testCase.line,
      nodeDirectories: [testCase.directory],
    });

    expect(result.ok).toBe(true);
  });

  it.each(lintPolicyRejectedSuffixCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    const result = await observeLintPolicyOfProduct({
      declaredLine: testCase.line,
      nodeDirectories: [testCase.directory],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(testCase.directory);
    }
  });
});
