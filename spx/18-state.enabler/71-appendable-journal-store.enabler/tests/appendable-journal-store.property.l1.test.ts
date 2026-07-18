import { isDeepStrictEqual } from "node:util";

import { describe, it } from "vitest";

import { JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { arbitraryJournalSequenceInput } from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeAppendableJournalSequence } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — sequence and replay", () => {
  it("assigns contiguous sequence numbers and replays them identically when a fresh store reopens the same run", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const observation = await observeAppendableJournalSequence(inputs, identity);
        return isDeepStrictEqual(
          observation.appended.map((event) => event.seq),
          observation.appended.map((_event, index) => JOURNAL_SEQ_BASE + index),
        ) && isDeepStrictEqual(observation.replay, observation.appended);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
