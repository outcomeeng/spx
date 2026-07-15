import { describe, it } from "vitest";

import { assertOverlappingAppendSequenceProperty } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — overlapping append sequence property", () => {
  it("persists unique contiguous sequences and rejects a conflicting append", async () => {
    await assertOverlappingAppendSequenceProperty();
  });
});
