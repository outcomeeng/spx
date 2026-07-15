import { describe, it } from "vitest";

import { assertConfigHandlersDeterministic } from "@testing/harnesses/config/cli";

describe("config command determinism", () => {
  it("returns identical results for identical dependencies and format options", async () => {
    await assertConfigHandlersDeterministic();
  });
});
