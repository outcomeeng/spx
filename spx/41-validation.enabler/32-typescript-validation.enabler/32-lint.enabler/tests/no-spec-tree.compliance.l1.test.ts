import { describe, expect, it } from "vitest";

import { observeLintPolicyOfProduct } from "@testing/harnesses/validation/lint-policy";

describe("lint policy of a product with no spec tree", () => {
  it("passes with no methodology declaration and no spx directory", async () => {
    const result = await observeLintPolicyOfProduct({ nodeDirectories: [] });

    expect(result.ok).toBe(true);
  });
});
