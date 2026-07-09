import { describe, expect, it } from "vitest";

import { captureSnapshot, listSnapshots, readLatestSnapshot, readSnapshot } from "@/lib/snapshot-store";
import { compareAsciiStrings, STATE_STORE_DOMAIN } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("snapshot store — scenarios", () => {
  it("reads back the exact document written to a fresh snapshot address", async () => {
    const [document] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const fs = createInMemoryStateStoreFileSystem();

    const captured = await captureSnapshot(scopeDir, STATE_STORE_DOMAIN.TEST, document, { fs });

    expect(captured.ok).toBe(true);
    if (!captured.ok) throw new Error(captured.error);
    expect(await readSnapshot(captured.value, { fs })).toEqual({ ok: true, value: document });
  });

  it("retains multiple snapshots under one scope, reads each back, and resolves the latest", async () => {
    const [firstDocument, secondDocument] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const fs = createInMemoryStateStoreFileSystem();

    const first = await captureSnapshot(scopeDir, STATE_STORE_DOMAIN.TEST, firstDocument, { fs });
    const second = await captureSnapshot(scopeDir, STATE_STORE_DOMAIN.TEST, secondDocument, { fs });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);
    if (!second.ok) throw new Error(second.error);

    // Both snapshots are retained and independently readable — neither clobbers the other.
    expect(await readSnapshot(first.value, { fs })).toEqual({ ok: true, value: firstDocument });
    expect(await readSnapshot(second.value, { fs })).toEqual({ ok: true, value: secondDocument });

    // Enumeration reports both addresses, and the latest resolves to its own document.
    const listed = await listSnapshots(scopeDir, STATE_STORE_DOMAIN.TEST, { fs });
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.error);
    expect([...listed.value.map((address) => address.runToken)].sort(compareAsciiStrings)).toEqual(
      [first.value.runToken, second.value.runToken].sort(compareAsciiStrings),
    );

    const latestDocument = second.value.runToken > first.value.runToken ? secondDocument : firstDocument;
    expect(await readLatestSnapshot(scopeDir, STATE_STORE_DOMAIN.TEST, { fs })).toEqual({
      ok: true,
      value: latestDocument,
    });
  });
});
