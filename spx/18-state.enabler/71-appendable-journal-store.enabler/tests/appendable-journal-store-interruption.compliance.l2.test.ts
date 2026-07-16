import { describe, expect, it } from "vitest";

import { appendableJournalInterruptionObservation } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — process interruption", () => {
  it("recovers on the correct side of the atomic sequence publication boundary", async () => {
    expect((await appendableJournalInterruptionObservation()).actual).toEqual(
      (await appendableJournalInterruptionObservation()).expected,
    );
  });
});
