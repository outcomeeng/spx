import { describe, it } from "vitest";

import { assertRenderSealedRunProjectionReadOnly } from "@testing/harnesses/verify/harness";

describe("verify render scenario", () => {
  it("renders the sealed run's journal projection with the authoritative finding count and appends no event", async () => {
    await assertRenderSealedRunProjectionReadOnly();
  });
});
