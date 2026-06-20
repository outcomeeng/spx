import { describe, expect, it } from "vitest";

import {
  appendJournalEvent,
  openJournalRun,
  readJournalEvents,
  renderJournalRun,
  sealJournalRun,
} from "@/commands/journal/runtime";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInputs, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";

describe("journal verbs", () => {
  it("maps each verb to its agent-run-journal contract operation", async () => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const inputs = sampleAgentRunJournalValue(arbitraryJournalEventInputs());
    const [firstInput] = inputs;
    if (firstInput === undefined) throw new Error("expected at least one event input");

    await withJournalHarness(async (productDir) => {
      const sink = new RecordingJournalStreamSink();

      // open maps to a new, empty, unsealed stream
      const opened = await openJournalRun({ productDir, branchSlug, type });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const { ref } = opened.value;
      expect(await renderJournalRun(ref, (events) => events.length)).toEqual({ ok: true, value: 0 });

      // append maps to sequenced events
      const appended: JournalEvent[] = [];
      for (const input of inputs) {
        const result = await appendJournalEvent(ref, input, sink);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        appended.push(result.value);
      }
      expect(appended[0]?.seq).toBe(JOURNAL_SEQ_BASE);
      const lastSeq = JOURNAL_SEQ_BASE + inputs.length - 1;
      expect(appended.at(-1)?.seq).toBe(lastSeq);

      // render maps to a projection of the full event prefix
      expect(await renderJournalRun(ref, (events) => events.length)).toEqual({ ok: true, value: inputs.length });

      // read --from <cursor> maps to the events at or after the cursor
      const fromLast = await readJournalEvents(ref, lastSeq);
      expect(fromLast.ok).toBe(true);
      if (!fromLast.ok) return;
      expect(fromLast.value.map((event) => event.seq)).toEqual([lastSeq]);

      // seal maps to a terminal seal that rejects further appends
      expect(await sealJournalRun(ref)).toEqual({ ok: true, value: undefined });
      const afterSeal = await appendJournalEvent(ref, firstInput, sink);
      expect(afterSeal.ok).toBe(false);
    });
  });
});
