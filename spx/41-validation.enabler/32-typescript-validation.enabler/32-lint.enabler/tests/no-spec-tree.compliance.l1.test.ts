import { describe, expect, it } from "vitest";

import { SPEC_TREE_CASE_TITLE } from "@testing/generators/spec-tree/spec-tree";
import { lintPolicyUndeclaredTreeCases } from "@testing/generators/validation/lint-policy";
import { observeLintPolicyOfProduct } from "@testing/harnesses/validation/lint-policy";

describe("lint policy of a product with no methodology declaration", () => {
  it("passes a product with no spx directory", async () => {
    const result = await observeLintPolicyOfProduct({ nodeDirectories: [] });

    expect(result.ok).toBe(true);
  });

  it.each(lintPolicyUndeclaredTreeCases())(SPEC_TREE_CASE_TITLE, async (testCase) => {
    const result = await observeLintPolicyOfProduct({ nodeDirectories: [testCase.directory] });

    expect(result.ok).toBe(false);
  });
});
