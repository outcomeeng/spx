import { isDeepStrictEqual } from "node:util";

import { describe, it } from "vitest";

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
          if (!appended.every((event, index) => event.seq === JOURNAL_SEQ_BASE + index)) return false;
        }
        return true;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("read(from=cursor) returns exactly the appended events at a sequence at or above the cursor", async () => {
    await assertProperty(
      arbitraryJournalCursorInput(),
      async ({ inputs, identity, cursor }) => {
        for (const storage of createJournalAdapterStorages(identity)) {
          const journal = createJournal(storage.open(), identity);
          const appended: JournalEvent[] = [];
          for (const input of inputs) appended.push(await journal.append(input));
          // the oracle is what append returned, not another read
          const expected = appended.filter((event) => event.seq >= cursor);
          if (!isDeepStrictEqual(await journal.read(cursor), expected)) return false;
        }
        return true;
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
          if (firstCall !== JSON.stringify(appended.filter((event) => event.seq <= throughSeq))) return false;
          if (repeatedCall !== firstCall) return false;
          rendered.push(firstCall);
        }
        return rendered.every((output) => output === rendered[0]);
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
          if (firstCall !== JSON.stringify(appended)) return false;
          if (repeatedCall !== firstCall) return false;
          rendered.push(firstCall);
        }
        return rendered.every((output) => output === rendered[0]);
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
          if (!isDeepStrictEqual(appended.map((event) => [event.seq, event.id]), expectedIdentities)) return false;

          // across restarts: a fresh journal over the reopened persisted history finds each event at its seq
          const afterRestart = await createJournal(storage.open(), identity).read(JOURNAL_SEQ_BASE);
          if (!isDeepStrictEqual(afterRestart, appended)) return false;

          // across re-run attempts: the same inputs re-run under a higher attempt on a fresh backend of
          // the same kind land at the same seqs
          const rerunStorage = rerunStorages[index];
          if (rerunStorage?.adapter !== storage.adapter) return false;
          const rerun = createJournal(rerunStorage.open(), identity);
          const rerunEvents: JournalEvent[] = [];
          for (const input of inputs) rerunEvents.push(await rerun.append({ ...input, attempt: input.attempt + 1 }));
          if (!isDeepStrictEqual(rerunEvents.map((event) => [event.seq, event.id]), expectedIdentities)) return false;
        }
        return true;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
