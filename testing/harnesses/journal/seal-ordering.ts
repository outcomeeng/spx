import { expect } from "vitest";

import {
  appendJournalEvent,
  listJournalRuns,
  openJournalRun,
  readSealedJournalRunSet,
  sealJournalRun,
} from "@/commands/journal/runtime";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { arbitrarySameMillisecondRunCreationInputs } from "@testing/generators/journal/run-ordering";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

export async function assertReverseSealPreservesRunCreationOrder(): Promise<void> {
  const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
  const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
  const creation = sampleStateStoreTestValue(arbitrarySameMillisecondRunCreationInputs());
  const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

  await withJournalHarness(async (productDir) => {
    const fs = createInMemoryStateStoreFileSystem();
    const first = await openJournalRun({ productDir, branchSlug, type }, {
      fs,
      now: () => creation.date,
      randomBytes: deterministicRunIdBytes(creation.firstIdBytes),
    });
    const second = await openJournalRun({ productDir, branchSlug, type }, {
      fs,
      now: () => creation.date,
      randomBytes: deterministicRunIdBytes(creation.secondIdBytes),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    await appendJournalEvent(first.value.ref, input, new RecordingJournalStreamSink(), { fs });
    await appendJournalEvent(second.value.ref, input, new RecordingJournalStreamSink(), { fs });
    await sealJournalRun(second.value.ref, { fs });
    await sealJournalRun(first.value.ref, { fs });

    const expectedNewestFirst = [second.value.ref.runToken, first.value.ref.runToken];
    const expectedOldestFirst = [...expectedNewestFirst].reverse();
    const listed = await listJournalRuns(
      { productDir, branchSlug, type, limit: expectedNewestFirst.length },
      { fs },
    );
    const readSet = await readSealedJournalRunSet(
      {
        productDir,
        branchSlug,
        type,
        eventLimit: expectedNewestFirst.length,
        limit: expectedNewestFirst.length,
      },
      { fs },
    );

    expect(listed).toMatchObject({ ok: true });
    expect(readSet).toMatchObject({ ok: true });
    if (!listed.ok || !readSet.ok) return;
    expect(listed.value.map((run) => run.runToken)).toEqual(expectedNewestFirst);
    expect(readSet.value.map((run) => run.runToken)).toEqual(expectedOldestFirst);
  });
}

function deterministicRunIdBytes(idBytes: Buffer): (size: number) => Buffer {
  return (size: number): Buffer => Buffer.from(idBytes.subarray(0, size));
}
