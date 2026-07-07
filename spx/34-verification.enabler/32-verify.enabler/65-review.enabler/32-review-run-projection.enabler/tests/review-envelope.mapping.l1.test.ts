import { describe, it } from "vitest";

import { assertFinishStatusAndRenderProjectTerminalMetadata } from "@testing/harnesses/verify/harness";

describe("review envelope projection", () => {
  it("maps terminal metadata into finish, status, and render projections", async () => {
    await assertFinishStatusAndRenderProjectTerminalMetadata();
  });
});
