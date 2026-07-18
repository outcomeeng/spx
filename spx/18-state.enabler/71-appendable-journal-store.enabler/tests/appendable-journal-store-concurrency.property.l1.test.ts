import { isDeepStrictEqual } from "node:util";

import fc from "fast-check";
import { describe, it } from "vitest";

import {
  createJournal,
  JOURNAL_ERROR,
  JOURNAL_SEQ_BASE,
  type JournalEventInput,
  type JournalIdentity,
} from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  journalRunFilePath,
} from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  isFulfilledOutcome,
  isRejectedOutcome,
  rejectedOutcomeMessage,
} from "@testing/harnesses/state/appendable-journal-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("appendable journal store — overlapping append sequence property", () => {
  it("persists unique contiguous sequences and rejects a conflicting append", async () => {
    await assertProperty(
      fc.tuple(
        arbitraryJournalEventInput(),
        arbitraryJournalEventInput(),
        arbitraryJournalIdentity(),
      ),
      async ([leftInput, rightInput, identity]: readonly [
        JournalEventInput,
        JournalEventInput,
        JournalIdentity,
      ]): Promise<boolean> => {
        const fs = createInMemoryStateStoreFileSystem();
        const runFilePath = journalRunFilePath(identity.streamid);
        const leftJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
        const rightJournal = createJournal(createAppendableJournalStore({ runFilePath, fs }), identity);
        const outcomes = await Promise.allSettled([
          leftJournal.append(leftInput),
          rightJournal.append(rightInput),
        ]);
        const replay = await createAppendableJournalStore({ runFilePath, fs }).readAll();
        const fulfilled = outcomes.filter(isFulfilledOutcome);
        const rejected = outcomes.filter(isRejectedOutcome);
        return isDeepStrictEqual(
          replay.map((event) => event.seq),
          replay.map((_event, index) => JOURNAL_SEQ_BASE + index),
        )
          && new Set(replay.map((event) => event.seq)).size === replay.length
          && fulfilled.length === replay.length
          && rejected.length === 1
          && rejectedOutcomeMessage(rejected[0]) === JOURNAL_ERROR.SEQ_CONSUMED;
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
