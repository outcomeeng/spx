import { describe, expect, it } from "vitest";

import { appendJournalEvent, openJournalRun, renderJournalRun } from "@/commands/journal/runtime";
import type { JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";

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
});
