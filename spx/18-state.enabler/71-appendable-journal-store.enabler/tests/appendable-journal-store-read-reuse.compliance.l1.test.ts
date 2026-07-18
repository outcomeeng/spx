import { describe, it } from "vitest";

import { assertSequenceRecordReadReuseCompliance } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — sequence-record read reuse", () => {
  it("reads each immutable sequence record at most once per backend lifetime", async () =>
    assertSequenceRecordReadReuseCompliance());
});
