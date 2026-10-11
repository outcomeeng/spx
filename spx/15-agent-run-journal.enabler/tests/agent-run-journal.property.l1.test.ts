import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import {
  arbitraryJournalCursorInput,
  arbitraryJournalPrefixInput,
  arbitraryJournalSequenceInput,
} from "@testing/generators/agent-run-journal";
import { createJournalAdapterStorages } from "@testing/harnesses/agent-run-journal/adapters";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

describe("agent-run-journal sequence, cursor, and render properties", () => {
  it("assigns strictly increasing, contiguous sequence numbers from the base on every adapter", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        for (const storage of createJournalAdapterStorages(identity)) {
          const journal = createJournal(storage.open(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await journal.append(input));
          expect(appended.map((event) => event.seq), storage.adapter).toEqual(
            inputs.map((_input, index) => JOURNAL_SEQ_BASE + index),
          );
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("read(from=cursor) returns exactly the appended events at a sequence at or above the cursor on every adapter", async () => {
    await assertProperty(
      arbitraryJournalCursorInput(),
      async ({ inputs, identity, cursor }) => {
        for (const storage of createJournalAdapterStorages(identity)) {
          const journal = createJournal(storage.open(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await journal.append(input));
          // the oracle is what append returned, not another read
          expect(await journal.read(cursor), storage.adapter).toEqual(
            appended.filter((event) => event.seq >= cursor),
          );
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("renders a byte-level projection over an event prefix identically across every adapter and repeated calls", async () => {
    await assertProperty(
      arbitraryJournalPrefixInput(),
      async ({ inputs, identity, throughSeq }) => {
        const rendered: string[] = [];
        for (const storage of createJournalAdapterStorages(identity)) {
          const writer = createJournal(storage.open(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await writer.append(input));
          // render through a reopened backend, so an adapter that persists by serialization replays its records
          const reader = createJournal(storage.open(), identity);
          const firstCall = await reader.render(JSON.stringify, throughSeq);
          const repeatedCall = await reader.render(JSON.stringify, throughSeq);
          expect(firstCall, storage.adapter).toBe(JSON.stringify(appended.filter((event) => event.seq <= throughSeq)));
          expect(repeatedCall, storage.adapter).toBe(firstCall);
          rendered.push(firstCall);
        }
        expect(new Set(rendered).size).toBe(1);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("renders the full history identically across every adapter and repeated calls when no through-sequence is given", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        const rendered: string[] = [];
        for (const storage of createJournalAdapterStorages(identity)) {
          const writer = createJournal(storage.open(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await writer.append(input));
          const reader = createJournal(storage.open(), identity);
          const firstCall = await reader.render(JSON.stringify);
          const repeatedCall = await reader.render(JSON.stringify);
          expect(firstCall, storage.adapter).toBe(JSON.stringify(appended));
          expect(repeatedCall, storage.adapter).toBe(firstCall);
          rendered.push(firstCall);
        }
        expect(new Set(rendered).size).toBe(1);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("assigns a sequence number that identifies an event identically across adapters, restarts, and re-run attempts", async () => {
    await assertProperty(
      arbitraryJournalSequenceInput(),
      async ({ inputs, identity }) => {
        // the i-th appended input is the event every backend must name by seq BASE + i
        const expectedIdentities = inputs.map((input, index) => [JOURNAL_SEQ_BASE + index, input.id]);
        const rerunStorages = createJournalAdapterStorages(identity);
        for (const [index, storage] of createJournalAdapterStorages(identity).entries()) {
          const journal = createJournal(storage.open(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await journal.append(input));
          expect(appended.map((event) => [event.seq, event.id]), storage.adapter).toEqual(expectedIdentities);

          // across restarts: a fresh journal over the reopened persisted history finds each event at its seq
          const afterRestart = await createJournal(storage.open(), identity).read(JOURNAL_SEQ_BASE);
          expect(afterRestart, storage.adapter).toEqual(appended);

          // across re-run attempts: the same inputs re-run under a higher attempt on a fresh backend of
          // the same kind land at the same seqs
          const rerunStorage = rerunStorages[index];
          expect(rerunStorage?.adapter).toBe(storage.adapter);
          const rerun = createJournal(rerunStorage.open(), identity);
          const rerunEvents: JournalEvent[] = [];
          for (const input of inputs) rerunEvents.push(await rerun.append({ ...input, attempt: input.attempt + 1 }));
          expect(rerunEvents.map((event) => [event.seq, event.id]), storage.adapter).toEqual(expectedIdentities);
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
