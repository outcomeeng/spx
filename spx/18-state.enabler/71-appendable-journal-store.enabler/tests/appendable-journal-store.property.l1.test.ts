import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  arbitraryJournalEventInputs,
  arbitraryJournalIdentity,
  journalRunFilePath,
} from "@testing/generators/agent-run-journal";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("appendable journal store — sequence and replay", () => {
  it("assigns contiguous sequence numbers and replays them identically when a fresh store reopens the same run", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryJournalEventInputs(),
        arbitraryJournalIdentity(),
        async (inputs, identity) => {
          const fs = createInMemoryStateStoreFileSystem();
          const runFilePath = journalRunFilePath(identity.streamid);
          const journal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);

          const appended: JournalEvent[] = [];
          for (const input of inputs) {
            appended.push(await journal.append(input));
          }
          appended.forEach((event, index) => {
            expect(event.seq).toBe(JOURNAL_SEQ_BASE + index);
          });

          // a fresh store over the same filesystem and run path replays the identical history
          const reopened = createAppendableJournalStore({ runFilePath, fs });
          expect(await reopened.readAll()).toEqual(appended);
        },
      ),
    );
  });
});
