import { describe, it } from "vitest";

import { assertAppendableJournalInterruptionCompliance } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — process interruption", () => {
  it(
    "recovers on the correct side of the atomic sequence publication boundary",
    assertAppendableJournalInterruptionCompliance,
  );
});
