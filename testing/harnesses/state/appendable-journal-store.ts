import fc from "fast-check";
import { expect } from "vitest";

import { createJournal, JOURNAL_ERROR, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  journalRunFilePath,
} from "@testing/generators/agent-run-journal";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

/** Prove sequence exclusivity when independent stores append to one run history concurrently. */
export async function assertOverlappingAppendSequenceProperty(): Promise<void> {
  await fc.assert(
    fc.asyncProperty(
      arbitraryJournalEventInput(),
      arbitraryJournalEventInput(),
      arbitraryJournalIdentity(),
      async (leftInput, rightInput, identity) => {
        const fs = createInMemoryStateStoreFileSystem();
        const runFilePath = journalRunFilePath(identity.streamid);
        const leftJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
        const rightJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
        const outcomes = await Promise.allSettled([
          leftJournal.append(leftInput),
          rightJournal.append(rightInput),
        ]);
        const replay = await createAppendableJournalStore({ runFilePath, fs }).readAll();
        const fulfilled = outcomes.filter(isFulfilled);
        const rejected = outcomes.filter(isRejected);

        expect(replay.map((event) => event.seq)).toEqual(
          replay.map((_event, index) => JOURNAL_SEQ_BASE + index),
        );
        expect(new Set(replay.map((event) => event.seq)).size).toBe(replay.length);
        expect(fulfilled).toHaveLength(replay.length);
        expect(rejected).toHaveLength(1);
        expect(rejectionMessage(rejected[0])).toBe(JOURNAL_ERROR.SEQ_CONSUMED);
      },
    ),
  );
}

function isFulfilled<T>(outcome: PromiseSettledResult<T>): outcome is PromiseFulfilledResult<T> {
  return outcome.status === "fulfilled";
}

function isRejected<T>(outcome: PromiseSettledResult<T>): outcome is PromiseRejectedResult {
  return outcome.status === "rejected";
}

function rejectionMessage(outcome: PromiseRejectedResult | undefined): string | undefined {
  const reason: unknown = outcome?.reason;
  return reason instanceof Error ? reason.message : undefined;
}
