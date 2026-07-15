import { describe, it } from "vitest";

import { assertEveryConfigFormatSupportsReadParseSerialize } from "@testing/harnesses/config/resolution";

describe("config format API mapping", () => {
  it("maps every declared format to config-owned read, parse, and serialize behavior", async () => {
    await assertEveryConfigFormatSupportsReadParseSerialize();
  });
});
