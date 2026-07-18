import { describe, expect, it } from "vitest";

import { observeAppendableJournalCreationMarker } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — creation marker", () => {
  it("preserves the opened run-file birthtime across aggregate replacement", async () => {
    await observeAppendableJournalCreationMarker().then((observation) => {
      expect(observation.creationMarkerBirthtimeMs).toBe(observation.openedBirthtimeMs);
      expect(observation.aggregateBirthtimeMs).toBeGreaterThan(observation.creationMarkerBirthtimeMs);
    });
  });
});
