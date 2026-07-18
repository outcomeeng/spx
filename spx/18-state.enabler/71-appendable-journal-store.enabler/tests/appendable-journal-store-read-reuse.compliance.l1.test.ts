import { describe, expect, it } from "vitest";

import { observeSequenceRecordReadReuse } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — sequence-record read reuse", () => {
  it("reads each immutable sequence record at most once per backend lifetime", async () => {
    await observeSequenceRecordReadReuse().then((observation) => {
      expect(observation.listCountAfterAppends).toBe(observation.inputCount);
      expect(observation.listCountAfterCurrentReplay).toBe(observation.inputCount + 1);
      expect(observation.readCountAfterCurrentReplay).toBe(0);
      expect(observation.listCountAfterReopenedReplays).toBe(observation.inputCount + 3);
      expect(observation.readCountAfterReopenedReplays).toBe(observation.inputCount);
    });
  });
});
