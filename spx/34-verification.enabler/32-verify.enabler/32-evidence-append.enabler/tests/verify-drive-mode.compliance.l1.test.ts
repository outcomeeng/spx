import { describe, it } from "vitest";

import { assertSpxDrivenRunRejectsCallerEvidenceAppend } from "@testing/harnesses/verify/harness";

describe("verify append drive-mode compliance", () => {
  it("rejects a caller scope or finding append to a run recorded spx-driven at start", async () => {
    await assertSpxDrivenRunRejectsCallerEvidenceAppend();
  });
});
