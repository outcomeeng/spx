import { join } from "node:path";

import { expect } from "vitest";

import { createJsonlRunFile, STATE_STORE_DOMAIN, STATE_STORE_PATH } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

export async function assertSingleArtifactRunFilePath(): Promise<void> {
  const date = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
  const runBytes = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runIdBytes());
  const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
  const created = await createJsonlRunFile(scopeDir, STATE_STORE_DOMAIN.TEST, {
    fs: createInMemoryStateStoreFileSystem(),
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
}
