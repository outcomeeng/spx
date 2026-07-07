import { describe, it } from "vitest";

import { assertInputReplaysRecordedInput } from "@testing/harnesses/verify/harness";

describe("verify input replay", () => {
  it("returns the exact verification input whose digest was recorded at start", async () => {
    await assertInputReplaysRecordedInput();
  });
});
