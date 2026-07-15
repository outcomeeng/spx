import { describe, it } from "vitest";

import { assertRetrieveDefersExitUntilStdoutDrains } from "@testing/harnesses/compact/cli";

describe("compact CLI IO", () => {
  it("records retrieve exit code without immediate process exit after writing output", async () => {
    await assertRetrieveDefersExitUntilStdoutDrains();
  });
});
