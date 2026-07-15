import { expect } from "vitest";

import {
  ERROR_CODE_NOT_FOUND,
  EXCLUSIVE_CREATE_FLAG,
  parseStateStoreError,
  publishJsonlRecordAtomically,
  readLatestJsonlRecord,
  STATE_STORE_ERROR,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

const ATOMIC_RECORD_PATH = "record-store/atomic-record.jsonl";
const PRE_PUBLICATION_RECORD_PATH = "record-store/pre-publication.jsonl";
const POST_PUBLICATION_RECORD_PATH = "record-store/post-publication.jsonl";
const INJECTED_INTERRUPTION = "injected publication interruption";

type PublicationInterruption = "before-link" | "after-link" | undefined;

interface LinkCapableStateStoreFileSystem extends StateStoreFileSystem {
  link(existingPath: string, newPath: string): Promise<void>;
}

/** Prove deterministic publication commits one complete winner and preserves it across collision. */
export async function assertAtomicJsonlPublicationCompliance(): Promise<void> {
  const [firstRecord, secondRecord] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
  const fs = createLinkCapableFileSystem();
  const first = await publishJsonlRecordAtomically(ATOMIC_RECORD_PATH, firstRecord, { fs });
  const second = await publishJsonlRecordAtomically(ATOMIC_RECORD_PATH, secondRecord, { fs });

  expect(first).toEqual({ ok: true, value: ATOMIC_RECORD_PATH });
  expect(second).toEqual({ ok: false, error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS });
  await expect(fs.readFile(ATOMIC_RECORD_PATH, "utf8")).resolves.toBe(`${JSON.stringify(firstRecord)}\n`);

  const interruptedBefore = createLinkCapableFileSystem("before-link");
  const beforeResult = await publishJsonlRecordAtomically(PRE_PUBLICATION_RECORD_PATH, firstRecord, {
    fs: interruptedBefore,
  });
  expect(beforeResult.ok).toBe(false);
  if (!beforeResult.ok) {
    expect(parseStateStoreError(beforeResult.error)?.code).toBe(STATE_STORE_ERROR.RECORD_WRITE_FAILED);
  }
  await expect(interruptedBefore.readFile(PRE_PUBLICATION_RECORD_PATH, "utf8")).rejects.toMatchObject({
    code: ERROR_CODE_NOT_FOUND,
  });
  await expect(
    publishJsonlRecordAtomically(PRE_PUBLICATION_RECORD_PATH, firstRecord, {
      fs: createLinkCapableFileSystem(undefined, interruptedBefore),
    }),
  ).resolves.toEqual({ ok: true, value: PRE_PUBLICATION_RECORD_PATH });

  const interruptedAfter = createLinkCapableFileSystem("after-link");
  const afterResult = await publishJsonlRecordAtomically(POST_PUBLICATION_RECORD_PATH, secondRecord, {
    fs: interruptedAfter,
  });
  expect(afterResult.ok).toBe(false);
  await expect(readLatestJsonlRecord(POST_PUBLICATION_RECORD_PATH, { fs: interruptedAfter })).resolves.toEqual({
    ok: true,
    value: secondRecord,
  });
}

function createLinkCapableFileSystem(
  interruption?: PublicationInterruption,
  delegate: StateStoreFileSystem = createInMemoryStateStoreFileSystem(),
): LinkCapableStateStoreFileSystem {
  return {
    mkdir: async (path, options) => delegate.mkdir(path, options),
    writeFile: async (path, data, options) => delegate.writeFile(path, data, options),
    appendFile: async (path, data) => delegate.appendFile(path, data),
    readFile: async (path, encoding) => delegate.readFile(path, encoding),
    readdir: async (path, options) => delegate.readdir(path, options),
    lstat: async (path) => delegate.lstat(path),
    rename: async (from, to) => delegate.rename(from, to),
    rm: async (path, options) => delegate.rm(path, options),
    link: async (existingPath, newPath) => {
      if (interruption === "before-link") throw new Error(INJECTED_INTERRUPTION);
      const body = await delegate.readFile(existingPath, "utf8");
      await delegate.writeFile(newPath, body, { flag: EXCLUSIVE_CREATE_FLAG });
      if (interruption === "after-link") throw new Error(INJECTED_INTERRUPTION);
    },
  };
}
