import { describe, it } from "vitest";

import { assertReviewCommentProjectionIncludesFindingPayload } from "@testing/harnesses/verify/harness";

describe("review comment projection", () => {
  it("maps a review finding payload into the rendered run projection", async () => {
    await assertReviewCommentProjectionIncludesFindingPayload();
  });
});
