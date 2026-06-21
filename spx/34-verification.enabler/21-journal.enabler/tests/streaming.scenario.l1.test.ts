import { describe, expect, it } from "vitest";

import {
  appendJournalEvent,
  JOURNAL_RUNTIME_ERROR,
  type JournalStreamSink,
  openJournalRun,
  readJournalEvents,
  renderJournalRun,
} from "@/commands/journal/runtime";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";

/** A streaming sink that always fails, exercising the best-effort emit path through DI. */
class FailingJournalStreamSink implements JournalStreamSink {
  emit(): Promise<void> {
    return Promise.reject(new Error("streaming surface unavailable"));
  }
}

describe("journal append streaming", () => {
  it("both persists an appended event and emits it to the run's streaming surface", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const sink = new RecordingJournalStreamSink();

      const opened = await openJournalRun({ productDir, branchSlug, type });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const { ref } = opened.value;

      const appended = await appendJournalEvent(ref, input, sink);
      expect(appended.ok).toBe(true);
      if (!appended.ok) return;

      // emitted to the streaming surface as it advances
      expect(sink.emitted).toEqual([appended.value]);

      // persisted to the bound backend
      const persisted = await renderJournalRun<readonly JournalEvent[]>(ref, (events) => [...events]);
      expect(persisted).toEqual({ ok: true, value: [appended.value] });
    });
  });

  it("does not fail a committed append when the streaming sink errors, so a retry cannot duplicate it", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const opened = await openJournalRun({ productDir, branchSlug, type });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const { ref } = opened.value;

      const appended = await appendJournalEvent(ref, input, new FailingJournalStreamSink());

      // The streaming emit threw, but the event is durably recorded, so the verb
      // reports success — the caller does not retry and cannot duplicate the fact.
      expect(appended.ok).toBe(true);
      const persisted = await renderJournalRun<readonly JournalEvent[]>(ref, (events) => [...events]);
      expect(persisted.ok).toBe(true);
      if (!persisted.ok) return;
      expect(persisted.value).toHaveLength(1);
    });
  });
});

describe("journal run preconditions", () => {
  it("rejects an operate-verb on a run token that open did not create", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const ref = { productDir, branchSlug, type, runToken };

      const appended = await appendJournalEvent(ref, input, new RecordingJournalStreamSink());
      expect(appended).toEqual({ ok: false, error: JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND });

      const read = await readJournalEvents(ref, 1);
      expect(read).toEqual({ ok: false, error: JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND });
    });
  });
});
