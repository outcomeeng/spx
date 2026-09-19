import { isDeepStrictEqual } from "node:util";

import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import {
  arbitraryJournalPairInput,
  arbitraryJournalSequenceInput,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal compliance", () => {
  it("rejects an append to a sealed journal", async () => {
    const { firstInput, secondInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());
    const journal = createJournal(createInMemoryAppendableBackend(), identity);

    await journal.append(firstInput);
    await journal.seal();

    await expect(journal.append(secondInput)).rejects.toThrow(JOURNAL_ERROR.SEALED);
  });

  it("never mutates or removes a persisted event; each append leaves the prior history intact", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const journal = createJournal(createInMemoryAppendableBackend(), identity);
        const appended: JournalEvent[] = [];
        for (const input of inputs) {
          const before = await journal.read(JOURNAL_SEQ_BASE);
          const event = await journal.append(input);
          appended.push(event);
          const after = await journal.read(JOURNAL_SEQ_BASE);

          // every previously persisted event is still present and unchanged (not removed, not
          // mutated), and the new event is appended at the end
          if (!isDeepStrictEqual(after.slice(0, before.length), before)) return false;
          if (after.length !== before.length + 1) return false;
          if (!isDeepStrictEqual(after[after.length - 1], event)) return false;
        }
        return isDeepStrictEqual(await journal.read(JOURNAL_SEQ_BASE), appended);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("never overwrites a persisted event when two journals race for one sequence number", async () => {
    const { firstInput, secondInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());

    // Two journals over one shared backend read the same history before either
    // publishes, so both target the same next seq; the backend's exclusive append
    // lets one win, and the other allocates again instead of writing over it.
    const backend = createInMemoryAppendableBackend();
    const journalA = createJournal(backend, identity);
    const journalB = createJournal(backend, identity);

    const [eventA, eventB] = await Promise.all([journalA.append(firstInput), journalB.append(secondInput)]);
    const persisted = await backend.readAll();

    // both events are persisted, at distinct contiguous sequences
    expect(persisted).toHaveLength(2);
    expect(persisted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE, JOURNAL_SEQ_BASE + 1]);
    // the winner's event is exactly what it returned — never overwritten by the loser's write
    expect(persisted[0]).toEqual([eventA, eventB].find((event) => event.seq === JOURNAL_SEQ_BASE));
    expect(persisted[1]).toEqual([eventA, eventB].find((event) => event.seq === JOURNAL_SEQ_BASE + 1));
  });
});
