import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createJsonlRunFile, STATE_STORE_DOMAIN, STATE_STORE_PATH, type StateStoreFileSystem } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";

function createNoopStateStoreFileSystem(): StateStoreFileSystem {
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: () => Promise.resolve(""),
    readdir: () => Promise.resolve([]),
    lstat: () =>
      Promise.resolve({ birthtimeMs: 0, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false }),
    link: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    rm: () => Promise.resolve(),
  };
}

describe("record store run path", () => {
  it("builds a single-artifact run file under runs/run-{run-token}.jsonl", async () => {
    const date = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
    const runBytes = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runIdBytes());
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());

    const created = await createJsonlRunFile(scopeDir, STATE_STORE_DOMAIN.TEST, {
      fs: createNoopStateStoreFileSystem(),
      now: () => date,
      randomBytes: () => runBytes,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    expect(created.value.runFileName).toBe(
      `${STATE_STORE_PATH.RUN_FILE_PREFIX}${created.value.runToken}${STATE_STORE_PATH.JSONL_EXTENSION}`,
    );
    expect(created.value.runToken).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[a-f0-9]{12}$/);
    expect(created.value.runFileName).toMatch(/^run-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[a-f0-9]{12}\.jsonl$/);
    expect(created.value.runFilePath).toBe(join(
      scopeDir,
      STATE_STORE_DOMAIN.TEST,
      STATE_STORE_PATH.RUNS_DIR,
      created.value.runFileName,
    ));
  });
});
