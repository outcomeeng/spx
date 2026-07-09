import { describe, expect, it } from "vitest";

import { captureSnapshot, readSnapshot } from "@/lib/snapshot-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("snapshot store — compliance", () => {
  it("rejects a second snapshot at an already-written address and leaves the persisted document unchanged", async () => {
    const [document, replacementDocument] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const snapshotDomain = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const date = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
    const runBytes = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runIdBytes());
    const fs = createInMemoryStateStoreFileSystem();

    // A fixed clock and fixed run bytes make both captures address the same run,
    // so the second capture must reject rather than overwrite the first.
    const first = await captureSnapshot(scopeDir, snapshotDomain, document, {
      fs,
      now: () => date,
      randomBytes: () => runBytes,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);

    const second = await captureSnapshot(scopeDir, snapshotDomain, replacementDocument, {
      fs,
      now: () => date,
      randomBytes: () => runBytes,
    });

    expect(second.ok).toBe(false);
    expect(await readSnapshot(first.value, { fs })).toEqual({ ok: true, value: document });
  });
});
