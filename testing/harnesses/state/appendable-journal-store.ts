import fc from "fast-check";
import { expect } from "vitest";

import { createJournal, JOURNAL_ERROR, JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { EXCLUSIVE_CREATE_FLAG, type StateStoreFileSystem } from "@/lib/state-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalIdentity,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

const INJECTED_APPEND_FAILURE = "injected append failure";
const EXPECTED_SEQUENCE_CLAIM_ATTEMPTS = 2;

interface FailOnceAppendFileSystem {
  readonly fs: StateStoreFileSystem;
  sequenceClaimAttempts(): number;
}

/** Prove sequence exclusivity when independent stores append to one run history concurrently. */
export async function assertOverlappingAppendSequenceProperty(): Promise<void> {
  await assertProperty(
    fc.tuple(
      arbitraryJournalEventInput(),
      arbitraryJournalEventInput(),
      arbitraryJournalIdentity(),
    ),
    async ([leftInput, rightInput, identity]) => {
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
    { level: PROPERTY_LEVEL.L1 },
  );
}

/** Prove a failed event write releases its sequence claim for a later retry. */
export async function assertFailedAppendReleasesSequenceClaim(): Promise<void> {
  const controlled = createFailOnceAppendFileSystem();
  const identity = sampleAgentRunJournalValue(arbitraryJournalIdentity());
  const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const runFilePath = journalRunFilePath(identity.streamid);
  const journal = createJournal(createAppendableJournalStore({ runFilePath, fs: controlled.fs }), identity);

  await expect(journal.append(input)).rejects.toThrow(INJECTED_APPEND_FAILURE);
  await expect(journal.append(input)).resolves.toMatchObject({ seq: JOURNAL_SEQ_BASE });
  expect(controlled.sequenceClaimAttempts()).toBe(EXPECTED_SEQUENCE_CLAIM_ATTEMPTS);
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

function createFailOnceAppendFileSystem(): FailOnceAppendFileSystem {
  const delegate = createInMemoryStateStoreFileSystem();
  let shouldFailAppend = true;
  let sequenceClaimAttempts = 0;
  const fs: StateStoreFileSystem = {
    mkdir: async (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) => {
      if (options?.flag === EXCLUSIVE_CREATE_FLAG) sequenceClaimAttempts += 1;
      await delegate.writeFile(path, data, options);
    },
    appendFile: async (path, data) => {
      if (shouldFailAppend) {
        shouldFailAppend = false;
        throw new Error(INJECTED_APPEND_FAILURE);
      }
      await delegate.appendFile(path, data);
    },
    readFile: async (path, encoding) => delegate.readFile(path, encoding),
    readdir: async (path, options) => delegate.readdir(path, options),
    lstat: async (path) => delegate.lstat(path),
    rename: async (from, to) => delegate.rename(from, to),
    rm: async (path, options) => delegate.rm(path, options),
  };
  return { fs, sequenceClaimAttempts: () => sequenceClaimAttempts };
}
