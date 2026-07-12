import { describe, it } from "vitest";

import { assertSpecContextCliResolvesAbbreviatedTarget } from "@testing/harnesses/spec/context";

describe("spx spec context process contract", () => {
  it("renders canonical context for an abbreviated target with a trailing separator", async () => {
    await assertSpecContextCliResolvesAbbreviatedTarget();
  });
});
