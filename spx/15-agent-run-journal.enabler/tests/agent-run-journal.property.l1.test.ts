import fc from "fast-check";
import { describe, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE, type JournalEvent, type JournalEventInput } from "@/lib/agent-run-journal";
import {
  arbitraryJournalEventInputs,
  arbitraryJournalIdentity,
  arbitraryJournalSequenceInput,
} from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";
import { assertProperty, PROPERTY_CLASSIFICATION } from "@testing/harnesses/property/property";

/** A content-bearing projection: it reads each event's identity, so it differs if any event's content diverges. */
const digestProjection = (events: readonly JournalEvent[]): string =>
  events.map((event) => `${event.seq}:${event.id}:${event.type}`).join("|");

const arbitraryScenarioWithOffset = fc.record({
  scenario: arbitraryJournalSequenceInput(),
  offset: fc.nat(),
});

async function appendAll(
  journal: ReturnType<typeof createJournal>,
  inputs: readonly JournalEventInput[],
): Promise<JournalEvent[]> {
  const appended: JournalEvent[] = [];
  for (const input of inputs) {
    appended.push(await journal.append(input));
  }
  return appended;
}

describe("agent-run-journal sequence, cursor, and render properties", () => {
  it("assigns strictly increasing, contiguous sequence numbers from the base", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const journal = createJournal(createInMemoryAppendableBackend(), identity);
        const appended = await appendAll(journal, inputs);
        return appended.every((event, index) => event.seq === JOURNAL_SEQ_BASE + index);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("read(from=cursor) returns exactly the events at a sequence at or above the cursor", async () => {
    await assertProperty(
      arbitraryScenarioWithOffset,
      async ({ scenario: { inputs, identity }, offset }) => {
        const journal = createJournal(createInMemoryAppendableBackend(), identity);
        // the events `append` returned are the oracle: the expectation never passes through `read`
        const appended = await appendAll(journal, inputs);
        const cursor = JOURNAL_SEQ_BASE + (offset % (inputs.length + 1));
        const fromCursor = await journal.read(cursor);
        const expected = appended.filter((event) => event.seq >= cursor);
        return JSON.stringify(fromCursor) === JSON.stringify(expected);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("renders a content-bearing projection over an event prefix identically across backends and repeated calls", async () => {
    await assertProperty(
      arbitraryScenarioWithOffset,
      async ({ scenario: { inputs, identity }, offset }) => {
        const journalA = createJournal(createInMemoryAppendableBackend(), identity);
        const journalB = createJournal(createInMemoryAppendableBackend(), identity);
        await appendAll(journalA, inputs);
        await appendAll(journalB, inputs);
        const throughSeq = JOURNAL_SEQ_BASE + (offset % inputs.length);
        const firstCall = await journalA.render(digestProjection, throughSeq);
        const repeatedCall = await journalA.render(digestProjection, throughSeq);
        const otherBackend = await journalB.render(digestProjection, throughSeq);
        return repeatedCall === firstCall && otherBackend === firstCall;
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("renders the full history identically across backends and repeated calls when no through-sequence is given", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const journalA = createJournal(createInMemoryAppendableBackend(), identity);
        const journalB = createJournal(createInMemoryAppendableBackend(), identity);
        await appendAll(journalA, inputs);
        await appendAll(journalB, inputs);
        // render() with no through-sequence folds the entire history — the
        // default-prefix branch distinct from a bounded throughSeq.
        const firstCall = await journalA.render(digestProjection);
        const repeatedCall = await journalA.render(digestProjection);
        const otherBackend = await journalB.render(digestProjection);
        // the unbounded render equals a render bounded at the last appended seq
        const throughLast = await journalA.render(digestProjection, JOURNAL_SEQ_BASE + inputs.length - 1);
        return repeatedCall === firstCall && otherBackend === firstCall && firstCall === throughLast;
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });

  it("assigns a sequence number that identifies an event identically across backends, restarts, and re-run attempts", async () => {
    await assertProperty(
      fc.record({ inputs: arbitraryJournalEventInputs(), identity: arbitraryJournalIdentity() }),
      async ({ inputs, identity }) => {
        const backendA = createInMemoryAppendableBackend();
        const backendB = createInMemoryAppendableBackend();
        const seqsA = (await appendAll(createJournal(backendA, identity), inputs)).map((event) => event.seq);
        const seqsB = (await appendAll(createJournal(backendB, identity), inputs)).map((event) => event.seq);

        // across restarts: a fresh journal over the same persisted backend reads identical seqs
        const afterRestart = await createJournal(backendA, identity).read(JOURNAL_SEQ_BASE);

        // across re-run attempts: re-running the same inputs under a higher attempt yields the same seqs
        const rerunInputs = inputs.map((input) => ({ ...input, attempt: input.attempt + 1 }));
        const rerunSeqs = (
          await appendAll(createJournal(createInMemoryAppendableBackend(), identity), rerunInputs)
        ).map((event) => event.seq);

        return JSON.stringify(seqsB) === JSON.stringify(seqsA)
          && JSON.stringify(afterRestart.map((event) => event.seq)) === JSON.stringify(seqsA)
          && JSON.stringify(rerunSeqs) === JSON.stringify(seqsA);
      },
      PROPERTY_CLASSIFICATION.SMALL_L1,
    );
  });
});
