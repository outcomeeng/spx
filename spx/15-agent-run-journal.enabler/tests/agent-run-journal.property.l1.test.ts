import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInputs, arbitraryJournalIdentity } from "@testing/generators/agent-run-journal";
import { createInMemoryAppendableBackend } from "@testing/harnesses/agent-run-journal/in-memory-backend";

/** A content-bearing projection: it reads each event's identity, so it differs if any event's content diverges. */
const digestProjection = (events: readonly JournalEvent[]): string =>
  events.map((event) => `${event.seq}:${event.id}:${event.type}`).join("|");

describe("agent-run-journal sequence, cursor, and render properties", () => {
  it("assigns strictly increasing, contiguous sequence numbers from the base", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        async (inputs, identity) => {
          const journal = createJournal(createInMemoryAppendableBackend(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) {
            appended.push(await journal.append(input));
          }
          appended.forEach((event, index) => {
            expect(event.seq).toBe(JOURNAL_SEQ_BASE + index);
          });
        },
      ),
    );
  });

  it("read(from=cursor) returns exactly the events at a sequence at or above the cursor", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        fc.nat(),
        async (inputs, identity, cursorOffset) => {
          const journal = createJournal(createInMemoryAppendableBackend(), identity);
          for (const input of inputs) {
            await journal.append(input);
          }
          const all = await journal.read(JOURNAL_SEQ_BASE);
          const cursor = JOURNAL_SEQ_BASE + (cursorOffset % (inputs.length + 1));
          const fromCursor = await journal.read(cursor);
          expect(fromCursor).toEqual(all.filter((event) => event.seq >= cursor));
        },
      ),
    );
  });

  it("renders a content-bearing projection over an event prefix identically across backends and repeated calls", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        fc.nat(),
        async (inputs, identity, prefixOffset) => {
          const journalA = createJournal(createInMemoryAppendableBackend(), identity);
          const journalB = createJournal(createInMemoryAppendableBackend(), identity);
          for (const input of inputs) {
            await journalA.append(input);
            await journalB.append(input);
          }
          const throughSeq = JOURNAL_SEQ_BASE + (prefixOffset % inputs.length);
          const firstCall = await journalA.render(digestProjection, throughSeq);
          const repeatedCall = await journalA.render(digestProjection, throughSeq);
          const otherBackend = await journalB.render(digestProjection, throughSeq);
          expect(repeatedCall).toBe(firstCall);
          expect(otherBackend).toBe(firstCall);
        },
      ),
    );
  });

  it("renders the full history identically across backends and repeated calls when no through-sequence is given", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        async (inputs, identity) => {
          const journalA = createJournal(createInMemoryAppendableBackend(), identity);
          const journalB = createJournal(createInMemoryAppendableBackend(), identity);
          for (const input of inputs) {
            await journalA.append(input);
            await journalB.append(input);
          }
          // render() with no through-sequence folds the entire history — the
          // default-prefix branch distinct from a bounded throughSeq.
          const firstCall = await journalA.render(digestProjection);
          const repeatedCall = await journalA.render(digestProjection);
          const otherBackend = await journalB.render(digestProjection);
          expect(repeatedCall).toBe(firstCall);
          expect(otherBackend).toBe(firstCall);
          // the unbounded render equals a render bounded at the last appended seq
          const throughLast = await journalA.render(digestProjection, JOURNAL_SEQ_BASE + inputs.length - 1);
          expect(firstCall).toBe(throughLast);
        },
      ),
    );
  });

  it("assigns a sequence number that identifies an event identically across backends, restarts, and re-run attempts", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        async (inputs, identity) => {
          const backendA = createInMemoryAppendableBackend();
          const backendB = createInMemoryAppendableBackend();
          const seqsA: number[] = [];
          const seqsB: number[] = [];
          {
            const journalA = createJournal(backendA, identity);
            const journalB = createJournal(backendB, identity);
            for (const input of inputs) {
              seqsA.push((await journalA.append(input)).seq);
              seqsB.push((await journalB.append(input)).seq);
            }
          }
          // across backends: same inputs yield the same sequence numbers
          expect(seqsB).toEqual(seqsA);

          // across restarts: a fresh journal over the same persisted backend reads identical seqs
          const restarted = createJournal(backendA, identity);
          const afterRestart = await restarted.read(JOURNAL_SEQ_BASE);
          expect(afterRestart.map((event) => event.seq)).toEqual(seqsA);

          // across re-run attempts: re-running the same inputs under a higher attempt yields the same seqs
          const rerun = createJournal(createInMemoryAppendableBackend(), identity);
          const rerunSeqs: number[] = [];
          for (const input of inputs) {
            rerunSeqs.push((await rerun.append({ ...input, attempt: input.attempt + 1 })).seq);
          }
          expect(rerunSeqs).toEqual(seqsA);
        },
      ),
    );
  });
});
