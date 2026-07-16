import { describe, it } from "vitest";

import { assertAppendableJournalSealingRaceProperty } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — append and seal race property", () => {
  it("includes every successful append in the sealed aggregate", async () => {
    await assertAppendableJournalSealingRaceProperty();
  });
});
