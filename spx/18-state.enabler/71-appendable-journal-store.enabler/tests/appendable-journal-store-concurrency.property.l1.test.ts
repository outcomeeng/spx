import { describe, it } from "vitest";

import { assertProperty } from "@testing/harnesses/property/property";
import { OVERLAPPING_APPEND_SEQUENCE_PROPERTY } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — overlapping append sequence property", () => {
  it("persists unique contiguous sequences and rejects a conflicting append", async () => {
    await assertProperty(
      OVERLAPPING_APPEND_SEQUENCE_PROPERTY.arbitrary,
      OVERLAPPING_APPEND_SEQUENCE_PROPERTY.predicate,
      OVERLAPPING_APPEND_SEQUENCE_PROPERTY.classification,
    );
  });
});
