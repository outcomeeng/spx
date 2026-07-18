import { describe, it } from "vitest";

import { assertAppendableJournalCreationMarkerScenario } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — creation marker", () => {
  it("preserves the opened run-file birthtime across aggregate replacement", async () =>
    assertAppendableJournalCreationMarkerScenario());
});
