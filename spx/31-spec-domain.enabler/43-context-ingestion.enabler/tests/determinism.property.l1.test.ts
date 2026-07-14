import { describe, it } from "vitest";

import { assertSpecContextProjectionIsDeterministic } from "@testing/harnesses/spec/context";

describe("spec context determinism", () => {
  it("produces byte-identical machine output across repeated runs on identical tree content", async () => {
    await assertSpecContextProjectionIsDeterministic();
  });
});
