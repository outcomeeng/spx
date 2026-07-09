import { describe, expect, it } from "vitest";

import { captureSnapshot, listSnapshots, readLatestSnapshot, readSnapshot } from "@/lib/snapshot-store";
import { compareAsciiStrings } from "@/lib/state-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("snapshot store — scenarios", () => {
  it("reads back the exact document written to a fresh snapshot address", async () => {
    const [document] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const snapshotDomain = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const fs = createInMemoryStateStoreFileSystem();

    const captured = await captureSnapshot(scopeDir, snapshotDomain, document, { fs });

    expect(captured.ok).toBe(true);
    if (!captured.ok) throw new Error(captured.error);
    expect(await readSnapshot(captured.value, { fs })).toEqual({ ok: true, value: document });
  });

  it("reports an empty enumeration and no latest document for a scope holding no snapshot", async () => {
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const snapshotDomain = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const fs = createInMemoryStateStoreFileSystem();

    // The fold-from-snapshot consumer reads every node before its first capture, so an
    // absent runs directory resolves to no document rather than failing.
    expect(await listSnapshots(scopeDir, snapshotDomain, { fs })).toEqual({ ok: true, value: [] });
    expect(await readLatestSnapshot(scopeDir, snapshotDomain, { fs })).toEqual({ ok: true, value: undefined });
  });

  it("retains both snapshots and resolves the latest by write order even when the run-token order disagrees", async () => {
    const [firstDocument, secondDocument] = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.jsonRecordPair());
    const scopeDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const snapshotDomain = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const capturedAt = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runDate());
    const fs = createInMemoryStateStoreFileSystem();

    // Both captures share one millisecond, and the LATER write is given the lexically
    // smaller random suffix, so run-token order and write order disagree. Only a real
    // creation-order signal (filesystem birthtime) resolves the true latest here — a
    // token-only ordering would pick the first-written snapshot.
    const [highSuffixBytes, lowSuffixBytes] = sampleStateStoreTestValue(
      STATE_STORE_TEST_GENERATOR.runIdBytesDescendingPair(),
    );

    const first = await captureSnapshot(scopeDir, snapshotDomain, firstDocument, {
      fs,
      now: () => capturedAt,
      randomBytes: () => highSuffixBytes,
    });
    const second = await captureSnapshot(scopeDir, snapshotDomain, secondDocument, {
      fs,
      now: () => capturedAt,
      randomBytes: () => lowSuffixBytes,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);
    if (!second.ok) throw new Error(second.error);

    // Premise of the oracle: the later write sorts EARLIER by run token, so a token-only
    // ordering would resolve the wrong snapshot as latest.
    expect(compareAsciiStrings(second.value.runToken, first.value.runToken)).toBeLessThan(0);

    // Both snapshots are retained and independently readable — neither clobbers the other.
    expect(await readSnapshot(first.value, { fs })).toEqual({ ok: true, value: firstDocument });
    expect(await readSnapshot(second.value, { fs })).toEqual({ ok: true, value: secondDocument });

    // Enumeration reports both addresses.
    const listed = await listSnapshots(scopeDir, snapshotDomain, { fs });
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error(listed.error);
    expect([...listed.value.map((address) => address.runToken)].sort(compareAsciiStrings)).toEqual(
      [first.value.runToken, second.value.runToken].sort(compareAsciiStrings),
    );

    // The latest resolves to the document written LAST, not the one whose run token sorts last.
    expect(listed.value[0].runToken).toBe(second.value.runToken);
    expect(await readLatestSnapshot(scopeDir, snapshotDomain, { fs })).toEqual({
      ok: true,
      value: secondDocument,
    });
  });
});
