import { expect } from "vitest";

import {
  ERROR_CODE_NOT_FOUND,
  parseStateStoreError,
  publishJsonlRecordAtomically,
  readLatestJsonlRecord,
  removeAtomicJsonlTemporaryFiles,
  STATE_STORE_ERROR,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import {
  sampleStateStoreTestValue,
  STATE_STORE_TEST_GENERATOR,
} from "@testing/generators/state-store/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

const ATOMIC_RECORD_PATH = "record-store/atomic-record.jsonl";
const PRE_PUBLICATION_RECORD_PATH = "record-store/pre-publication.jsonl";
const POST_PUBLICATION_RECORD_PATH = "record-store/post-publication.jsonl";
const INJECTED_INTERRUPTION = "injected publication interruption";
const BLOCKED_RECORD_PATH = "record-store/blocked-record.jsonl";
const REMOVED_TEMPORARY_RECORD_PATH =
  "record-store/removed-temporary-record.jsonl";
const CLEANUP_DESTINATION_PREFIX = "record-store/cleanup-record-";
const FIRST_CLEANUP_TEMPORARY_PATH =
  "record-store/cleanup-record-1.jsonl.000000000001.tmp";
const SECOND_CLEANUP_TEMPORARY_PATH =
  "record-store/cleanup-record-2.jsonl.000000000002.tmp";
const CLEANUP_DESTINATION_PATH = "record-store/cleanup-record-1.jsonl";
const NON_MATCHING_TEMPORARY_PATH =
  "record-store/cleanup-record-3.jsonl.invalid.tmp";

type PublicationInterruption = "before-link" | "after-link" | undefined;

interface LinkCapableStateStoreFileSystem extends StateStoreFileSystem {
  link(existingPath: string, newPath: string): Promise<void>;
}

/** Prove deterministic publication commits one complete winner and preserves it across collision. */
export async function assertAtomicJsonlPublicationCompliance(): Promise<void> {
  const [firstRecord, secondRecord] = sampleStateStoreTestValue(
    STATE_STORE_TEST_GENERATOR.jsonRecordPair()
  );
  const fs = createLinkCapableFileSystem();
  const first = await publishJsonlRecordAtomically(
    ATOMIC_RECORD_PATH,
    firstRecord,
    { fs }
  );
  const second = await publishJsonlRecordAtomically(
    ATOMIC_RECORD_PATH,
    secondRecord,
    { fs }
  );

  expect(first).toEqual({ ok: true, value: ATOMIC_RECORD_PATH });
  expect(second).toEqual({
    ok: false,
    error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS,
  });
  await expect(fs.readFile(ATOMIC_RECORD_PATH, "utf8")).resolves.toBe(
    `${JSON.stringify(firstRecord)}\n`
  );

  const beforeDelegate = createInMemoryStateStoreFileSystem();
  const interruptedBefore = createLinkCapableFileSystem(
    "before-link",
    beforeDelegate
  );
  const beforeResult = await publishJsonlRecordAtomically(
    PRE_PUBLICATION_RECORD_PATH,
    firstRecord,
    {
      fs: interruptedBefore,
    }
  );
  expect(beforeResult.ok).toBe(false);
  if (!beforeResult.ok) {
    expect(parseStateStoreError(beforeResult.error)?.code).toBe(
      STATE_STORE_ERROR.RECORD_WRITE_FAILED
    );
  }
  await expect(
    interruptedBefore.readFile(PRE_PUBLICATION_RECORD_PATH, "utf8")
  ).rejects.toMatchObject({
    code: ERROR_CODE_NOT_FOUND,
  });
  await expect(
    publishJsonlRecordAtomically(PRE_PUBLICATION_RECORD_PATH, firstRecord, {
      fs: createLinkCapableFileSystem(undefined, beforeDelegate),
    })
  ).resolves.toEqual({ ok: true, value: PRE_PUBLICATION_RECORD_PATH });

  const interruptedAfter = createLinkCapableFileSystem("after-link");
  const afterResult = await publishJsonlRecordAtomically(
    POST_PUBLICATION_RECORD_PATH,
    secondRecord,
    {
      fs: interruptedAfter,
    }
  );
  expect(afterResult.ok).toBe(false);
  await expect(
    readLatestJsonlRecord(POST_PUBLICATION_RECORD_PATH, {
      fs: interruptedAfter,
    })
  ).resolves.toEqual({
    ok: true,
    value: secondRecord,
  });

  const blocked = await publishJsonlRecordAtomically(
    BLOCKED_RECORD_PATH,
    firstRecord,
    {
      fs,
      publicationGuard: async () => false,
    }
  );
  expect(blocked).toEqual({
    ok: false,
    error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
  });
  await expect(fs.readFile(BLOCKED_RECORD_PATH, "utf8")).rejects.toMatchObject({
    code: ERROR_CODE_NOT_FOUND,
  });

  let temporaryPath: string | undefined;
  const removedTemporaryFileSystem = createTemporaryCapturingFileSystem(
    fs,
    (path) => {
      temporaryPath = path;
    }
  );
  const removed = await publishJsonlRecordAtomically(
    REMOVED_TEMPORARY_RECORD_PATH,
    firstRecord,
    {
      fs: removedTemporaryFileSystem,
      publicationGuard: async () => {
        if (temporaryPath !== undefined)
          await fs.rm(temporaryPath, { force: true });
        return true;
      },
    }
  );
  expect(removed).toEqual({
    ok: false,
    error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED,
  });

  await assertTemporaryPrefixCleanup(fs);
}

async function assertTemporaryPrefixCleanup(
  fs: StateStoreFileSystem
): Promise<void> {
  await fs.writeFile(FIRST_CLEANUP_TEMPORARY_PATH, "first");
  await fs.writeFile(SECOND_CLEANUP_TEMPORARY_PATH, "second");
  await fs.writeFile(CLEANUP_DESTINATION_PATH, "destination");
  await fs.writeFile(NON_MATCHING_TEMPORARY_PATH, "unowned");

  await expect(
    removeAtomicJsonlTemporaryFiles(CLEANUP_DESTINATION_PREFIX, { fs })
  ).resolves.toEqual({
    ok: true,
    value: 2,
  });
  await expect(
    fs.readFile(FIRST_CLEANUP_TEMPORARY_PATH, "utf8")
  ).rejects.toMatchObject({
    code: ERROR_CODE_NOT_FOUND,
  });
  await expect(
    fs.readFile(SECOND_CLEANUP_TEMPORARY_PATH, "utf8")
  ).rejects.toMatchObject({
    code: ERROR_CODE_NOT_FOUND,
  });
  await expect(fs.readFile(CLEANUP_DESTINATION_PATH, "utf8")).resolves.toBe(
    "destination"
  );
  await expect(fs.readFile(NON_MATCHING_TEMPORARY_PATH, "utf8")).resolves.toBe(
    "unowned"
  );
}

function createTemporaryCapturingFileSystem(
  delegate: StateStoreFileSystem,
  capture: (path: string) => void
): StateStoreFileSystem {
  return {
    mkdir: (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) => {
      await delegate.writeFile(path, data, options);
      if (options?.flag !== undefined) capture(path);
    },
    appendFile: (path, data) => delegate.appendFile(path, data),
    readFile: (path, encoding) => delegate.readFile(path, encoding),
    readdir: (path, options) => delegate.readdir(path, options),
    lstat: (path) => delegate.lstat(path),
    link: (existingPath, newPath) => delegate.link(existingPath, newPath),
    rename: (from, to) => delegate.rename(from, to),
    rm: (path, options) => delegate.rm(path, options),
  };
}

function createLinkCapableFileSystem(
  interruption?: PublicationInterruption,
  delegate: StateStoreFileSystem = createInMemoryStateStoreFileSystem()
): LinkCapableStateStoreFileSystem {
  return {
    mkdir: async (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) =>
      delegate.writeFile(path, data, options),
    appendFile: async (path, data) => delegate.appendFile(path, data),
    readFile: async (path, encoding) => delegate.readFile(path, encoding),
    readdir: async (path, options) => delegate.readdir(path, options),
    lstat: async (path) => delegate.lstat(path),
    rename: async (from, to) => delegate.rename(from, to),
    rm: async (path, options) => delegate.rm(path, options),
    link: async (existingPath, newPath) => {
      if (interruption === "before-link")
        throw new Error(INJECTED_INTERRUPTION);
      await delegate.link(existingPath, newPath);
      if (interruption === "after-link") throw new Error(INJECTED_INTERRUPTION);
    },
  };
}
