import { describe, it } from "vitest";

import { assertFailedAppendReleasesSequenceClaim } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — sequence claim cleanup", () => {
  it("releases a sequence claim when event persistence fails", async () => {
    await assertFailedAppendReleasesSequenceClaim();
  });
});
