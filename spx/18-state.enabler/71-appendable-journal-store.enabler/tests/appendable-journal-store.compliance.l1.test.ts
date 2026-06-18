import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  journalRunFilePath,
} from "@testing/generators/agent-run-journal";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("appendable journal store — compliance", () => {
  it("rejects an append whose sequence number is already persisted with SEQ_CONSUMED", async () => {
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const [input] = fc.sample(arbitraryJournalEventInput(), 1);
    const fs = createInMemoryStateStoreFileSystem();
    const runFilePath = journalRunFilePath(identity.streamid);
    const store = createAppendableJournalStore({ runFilePath, fs });
    const journal = createJournal(store, identity);

    const event = await journal.append(input);

    // re-presenting an event whose seq is already persisted must not overwrite it
    await expect(store.append(event)).rejects.toThrow(JOURNAL_ERROR.SEQ_CONSUMED);
    await expect(store.readAll()).resolves.toEqual([event]);
  });

  it("reports the persisted seal across a fresh store and rejects a journal append after seal", async () => {
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const [input, next] = fc.sample(arbitraryJournalEventInput(), 2);
    const fs = createInMemoryStateStoreFileSystem();
    const runFilePath = journalRunFilePath(identity.streamid);
    const journal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);

    await journal.append(input);
    await journal.seal();

    // a fresh store over the same filesystem reads back the seal
    const reopened = createAppendableJournalStore({ runFilePath, fs });
    expect(await reopened.isSealed()).toBe(true);

    // and a journal bound to the reopened store rejects further appends
    const reopenedJournal = createJournal(reopened, identity);
    await expect(reopenedJournal.append(next)).rejects.toThrow(JOURNAL_ERROR.SEALED);
  });

  // "{}" is parseable JSON that fails event conformance; "not-json" fails JSON.parse
  // outright — readAll must skip both, exercising its conformance and parse-failure branches.
  it.each(["{}", "not-json"])("skips a stored line readAll cannot accept as an event (%s)", async (corrupt) => {
    const [identity] = fc.sample(arbitraryJournalIdentity(), 1);
    const [input] = fc.sample(arbitraryJournalEventInput(), 1);
    const fs = createInMemoryStateStoreFileSystem();
    const runFilePath = journalRunFilePath(identity.streamid);
    const store = createAppendableJournalStore({ runFilePath, fs });
    const journal = createJournal(store, identity);

    const event = await journal.append(input);
    // appended on its own line, separated by the newline the journal already terminated
    await fs.appendFile(runFilePath, corrupt);

    expect(await store.readAll()).toEqual([event]);
  });
});
