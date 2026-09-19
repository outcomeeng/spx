import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import {
  arbitraryJournalEventInput,
  arbitraryJournalEventInputs,
  arbitraryJournalIdentity,
} from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";

describe("agent-run-journal compliance", () => {
  it("rejects an append to a sealed journal", async () => {
    const [first, next] = fc.sample(arbitraryJournalEventInput(), 2);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const journal = createJournal(createInMemoryAppendableBackend(), identity);

    await journal.append(first);
    await journal.seal();

    await expect(journal.append(next)).rejects.toThrow(JOURNAL_ERROR.SEALED);
  });

  it("never mutates or removes a persisted event; each append leaves the prior history intact", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        async (inputs, identity) => {
          const journal = createJournal(createInMemoryAppendableBackend(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) {
            const before = await journal.read(JOURNAL_SEQ_BASE);
            const event = await journal.append(input);
            appended.push(event);
            const after = await journal.read(JOURNAL_SEQ_BASE);

            // every previously persisted event is still present and unchanged (not removed, not mutated)
            expect(after.slice(0, before.length)).toEqual(before);
            // the new event is appended at the end — a correction is a new event, never a replacement
            expect(after).toHaveLength(before.length + 1);
            expect(after[after.length - 1]).toEqual(event);
          }
          expect(await journal.read(JOURNAL_SEQ_BASE)).toEqual(appended);
        },
      ),
    );
  });

  it("never overwrites a persisted event when two journals race for one sequence number", async () => {
    const [inputA, inputB] = fc.sample(arbitraryJournalEventInput(), 2);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);

    // Two journals over one shared backend read the same history before either
    // publishes, so both target the same next seq; the backend's exclusive append
    // lets one win, and the other allocates again instead of writing over it.
    const backend = createInMemoryAppendableBackend();
    const journalA = createJournal(backend, identity);
    const journalB = createJournal(backend, identity);

    const [eventA, eventB] = await Promise.all([journalA.append(inputA), journalB.append(inputB)]);
    const persisted = await backend.readAll();

    // both events are persisted, at distinct contiguous sequences
    expect(persisted).toHaveLength(2);
    expect(persisted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE, JOURNAL_SEQ_BASE + 1]);
    // the winner's event is exactly what it returned — never overwritten by the loser's write
    expect(persisted[0]).toEqual([eventA, eventB].find((event) => event.seq === JOURNAL_SEQ_BASE));
    expect(persisted[1]).toEqual([eventA, eventB].find((event) => event.seq === JOURNAL_SEQ_BASE + 1));
  });
});
