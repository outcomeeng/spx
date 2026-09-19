import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { arbitraryJournalPairInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import {
  createRecordingAppendableBackend,
  createSealingOnCollisionBackend,
} from "@testing/harnesses/agent-run-journal/contending-backends";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";

describe("agent-run-journal compliance", () => {
  it("rejects an append to a sealed journal", async () => {
    const { firstInput, secondInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());
    const journal = createJournal(createInMemoryAppendableBackend(), identity);

    await journal.append(firstInput);
    await journal.seal();

    await expect(journal.append(secondInput)).rejects.toThrow(JOURNAL_ERROR.SEALED);
  });

  it("rejects an append whose collision retry meets a seal that landed during the collision", async () => {
    const { firstInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());
    const backend = createSealingOnCollisionBackend();

    await expect(createJournal(backend, identity).append(firstInput)).rejects.toThrow(JOURNAL_ERROR.SEALED);

    // the collision explained a retry, but the seal barrier ends the run before any second attempt
    expect(backend.observation.attemptedSequences).toEqual([JOURNAL_SEQ_BASE]);
    expect((await backend.readAll()).some((event) => event.id === firstInput.id)).toBe(false);
  });

  it("never overwrites a persisted event when two journals race for one sequence number", async () => {
    const { firstInput, secondInput, identity } = sampleAgentRunJournalValue(arbitraryJournalPairInput());

    // Two journals over one shared backend read the same history before either
    // publishes, so both target the same next seq; the backend's exclusive append
    // lets one win, and the other allocates again instead of writing over it.
    const backend = createRecordingAppendableBackend();
    const journalA = createJournal(backend, identity);
    const journalB = createJournal(backend, identity);

    const [eventA, eventB] = await Promise.all([journalA.append(firstInput), journalB.append(secondInput)]);
    const persisted = await backend.readAll();

    // the race really happened: the first sequence was written twice, and the loser re-allocated
    expect(backend.observation.attemptedSequences).toEqual([JOURNAL_SEQ_BASE, JOURNAL_SEQ_BASE, JOURNAL_SEQ_BASE + 1]);
    // both events are persisted, at distinct contiguous sequences
    expect(persisted).toHaveLength(2);
    expect(persisted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE, JOURNAL_SEQ_BASE + 1]);
    // the winner's event is exactly what it returned — never overwritten by the loser's write
    expect(persisted[0]).toEqual([eventA, eventB].find((event) => event.seq === JOURNAL_SEQ_BASE));
    expect(persisted[1]).toEqual([eventA, eventB].find((event) => event.seq === JOURNAL_SEQ_BASE + 1));
  });
});
