import { isDeepStrictEqual } from "node:util";

import { describe, it } from "vitest";

import { JOURNAL_ERROR, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { arbitraryJournalPairInput } from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { observeOverlappingAppendSequence } from "@testing/harnesses/state/appendable-journal-store";

describe("appendable journal store — overlapping append sequence property", () => {
  it("persists unique contiguous sequences and rejects a conflicting append", async () => {
    await assertProperty(
      arbitraryJournalPairInput(),
      async ({ firstInput, secondInput, identity }) => {
        const observation = await observeOverlappingAppendSequence(firstInput, secondInput, identity);
        return isDeepStrictEqual(
          observation.replay.map((event) => event.seq),
          observation.replay.map((_event, index) => JOURNAL_SEQ_BASE + index),
        )
          && new Set(observation.replay.map((event) => event.seq)).size === observation.replay.length
          && observation.fulfilledCount === observation.replay.length
          && observation.rejectedMessages.length === 1
          && observation.rejectedMessages[0] === JOURNAL_ERROR.SEQ_CONSUMED;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
