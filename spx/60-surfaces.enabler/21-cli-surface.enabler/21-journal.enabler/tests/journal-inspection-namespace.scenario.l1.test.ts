import { describe, it } from "vitest";

import { assertListAndRenderShareNonDefaultTerminalState } from "@testing/harnesses/journal/terminal-state-namespace";

describe("journal inspection namespace compatibility", () => {
  it("lists terminal state from the same completion event that render returns", async () => {
    await assertListAndRenderShareNonDefaultTerminalState();
  });
});
