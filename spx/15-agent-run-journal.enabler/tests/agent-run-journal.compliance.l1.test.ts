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

  it("rejects a journal write that targets an already-consumed sequence number", async () => {
    const [inputA, inputB] = fc.sample(arbitraryJournalEventInput(), 2);
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);

    // Two journals over one shared backend assign the same next seq when both read
    // the backend before either appends; the backend's exclusive append makes the
    // losing journal's write reject rather than overwrite the persisted event.
    const backend = createInMemoryAppendableBackend();
    const journalA = createJournal(backend, identity);
    const journalB = createJournal(backend, identity);

    const outcomes = await Promise.all([
      journalA.append(inputA).then(
        () => null,
        (error: Error) => error,
      ),
      journalB.append(inputB).then(
        () => null,
        (error: Error) => error,
      ),
    ]);
    const failures = outcomes.filter((outcome): outcome is Error => outcome !== null);

    expect(failures).toHaveLength(1);
    expect(failures[0].message).toBe(JOURNAL_ERROR.SEQ_CONSUMED);

    // the persisted event is the winner's; it was not overwritten
    expect(await backend.readAll()).toHaveLength(1);
  });
});
