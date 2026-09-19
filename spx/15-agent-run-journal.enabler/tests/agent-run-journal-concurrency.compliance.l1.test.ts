import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import {
  arbitraryContendedAppendInput,
  arbitraryJournalPairInput,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import {
  createContendingBackend,
  createNonGrowingRejectingBackend,
} from "@testing/harnesses/agent-run-journal/contending-backends";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal — consumed-sequence retry boundary", () => {
  it("fails with SEQ_CONSUMED after one refreshed read when the colliding history has not grown", async () => {
    const { firstInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());
    const backend = createNonGrowingRejectingBackend();

    await expect(createJournal(backend, identity).append(firstInput)).rejects.toThrow(JOURNAL_ERROR.SEQ_CONSUMED);

    // the initial read plus exactly one refreshed read: no retry at a sequence the history already held
    expect(backend.observation.readAllCount).toBe(2);
    expect(backend.observation.attemptedSequences).toEqual([JOURNAL_SEQ_BASE]);
  });

  it("never fails on a collision the refreshed history explains; it publishes past every competitor", async () => {
    await assertProperty(
      arbitraryContendedAppendInput(),
      async ({ input, identity, competitorCount }) => {
        const backend = createContendingBackend(competitorCount);
        const event = await createJournal(backend, identity).append(input);
        const persisted = await backend.readAll();
        // competitors hold BASE .. BASE+k-1; the appender lands at BASE+k, never at a held sequence
        return event.seq === JOURNAL_SEQ_BASE + competitorCount
          && backend.observation.attemptedSequences.every((seq, index) => seq === JOURNAL_SEQ_BASE + index)
          && persisted.filter((stored) => stored.seq === event.seq).length === 1
          && persisted[persisted.length - 1]?.id === event.id;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
