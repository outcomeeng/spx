import { describe, it } from "vitest";

import { assertReviewScopeProjectionIncludesCleanReviewedUnit } from "@testing/harnesses/verify/harness";

describe("review scope projection", () => {
  it("includes a clean reviewed unit without adding a finding", async () => {
    await assertReviewScopeProjectionIncludesCleanReviewedUnit();
  });
});
