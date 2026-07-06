import { describe, it } from "vitest";

import { assertRenderUnsealedRunReadOnlyAndUnsealed } from "@testing/harnesses/verify/harness";

describe("verify render compliance", () => {
  it("projects an unsealed run read-only, reporting sealed:false with no terminal status, appending no event, and sealing no run", async () => {
    await assertRenderUnsealedRunReadOnlyAndUnsealed();
  });
});
