import { describe, expect, it } from "vitest";

import {
  appendJournalEvent,
  listJournalRuns,
  openJournalRun,
  readJournalEvents,
  readSealedJournalRunSet,
  renderJournalRun,
  sealJournalRun,
} from "@/commands/journal/runtime";
import { JOURNAL_CLI } from "@/interfaces/cli/journal";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JournalEventInput } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInputs, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";

interface JournalVerbMappingCase {
  readonly verbName: string;
  exercise(productDir: string): Promise<void>;
}

function generatedScope(): { readonly branchSlug: string; readonly type: string } {
  return {
    branchSlug: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug()),
    type: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken()),
  };
}

function sampleEventInputs(): {
  readonly firstInput: JournalEventInput;
  readonly inputs: readonly JournalEventInput[];
} {
  const inputs = sampleAgentRunJournalValue(arbitraryJournalEventInputs());
  const [firstInput] = inputs;
  if (firstInput === undefined) throw new Error("expected at least one event input");
  return { firstInput, inputs };
}

function journalVerbMappingCases(): readonly JournalVerbMappingCase[] {
  return [
    {
      verbName: JOURNAL_CLI.openCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        expect(await renderJournalRun(opened.value.ref, (events) => events.length)).toEqual({ ok: true, value: 0 });
      },
    },
    {
      verbName: JOURNAL_CLI.appendCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const { inputs } = sampleEventInputs();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const sink = new RecordingJournalStreamSink();
        const appended: JournalEvent[] = [];
        for (const input of inputs) {
          const result = await appendJournalEvent(opened.value.ref, input, sink);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          appended.push(result.value);
        }
        expect(appended[0]?.seq).toBe(JOURNAL_SEQ_BASE);
        expect(sink.emitted.map((event) => event.seq)).toEqual(appended.map((event) => event.seq));
      },
    },
    {
      verbName: JOURNAL_CLI.readCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const { inputs } = sampleEventInputs();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const sink = new RecordingJournalStreamSink();
        for (const input of inputs) {
          const result = await appendJournalEvent(opened.value.ref, input, sink);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
        }
        const lastSeq = JOURNAL_SEQ_BASE + inputs.length - 1;
        const fromLast = await readJournalEvents(opened.value.ref, lastSeq);
        expect(fromLast.ok).toBe(true);
        if (!fromLast.ok) return;
        expect(fromLast.value.map((event) => event.seq)).toEqual([lastSeq]);
      },
    },
    {
      verbName: JOURNAL_CLI.sealCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const { firstInput } = sampleEventInputs();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const sink = new RecordingJournalStreamSink();
        expect(await appendJournalEvent(opened.value.ref, firstInput, sink)).toMatchObject({ ok: true });
        expect(await sealJournalRun(opened.value.ref)).toEqual({ ok: true, value: undefined });
        const afterSeal = await appendJournalEvent(opened.value.ref, firstInput, sink);
        expect(afterSeal.ok).toBe(false);
      },
    },
    {
      verbName: JOURNAL_CLI.renderCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const { inputs } = sampleEventInputs();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const sink = new RecordingJournalStreamSink();
        for (const input of inputs) {
          const result = await appendJournalEvent(opened.value.ref, input, sink);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
        }
        expect(await renderJournalRun(opened.value.ref, (events) => events.length)).toEqual({
          ok: true,
          value: inputs.length,
        });
      },
    },
    {
      verbName: JOURNAL_CLI.listCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const listed = await listJournalRuns({ productDir, branchSlug, type });
        expect(listed.ok).toBe(true);
        if (!listed.ok) return;
        expect(listed.value.map((run) => run.runToken)).toEqual([opened.value.ref.runToken]);
      },
    },
    {
      verbName: JOURNAL_CLI.readSetCommandName,
      async exercise(productDir: string): Promise<void> {
        const { branchSlug, type } = generatedScope();
        const { firstInput } = sampleEventInputs();
        const opened = await openJournalRun({ productDir, branchSlug, type });
        expect(opened.ok).toBe(true);
        if (!opened.ok) return;
        const sink = new RecordingJournalStreamSink();
        const appended = await appendJournalEvent(opened.value.ref, firstInput, sink);
        expect(appended.ok).toBe(true);
        if (!appended.ok) return;
        expect(await sealJournalRun(opened.value.ref)).toEqual({ ok: true, value: undefined });
        const runSet = await readSealedJournalRunSet({ productDir, branchSlug, type });
        expect(runSet.ok).toBe(true);
        if (!runSet.ok) return;
        expect(runSet.value.map((run) => run.runToken)).toEqual([opened.value.ref.runToken]);
        expect(runSet.value[0]?.events.map((event) => event.seq)).toEqual([appended.value.seq]);
      },
    },
  ];
}

describe("journal verbs", () => {
  it.each(journalVerbMappingCases())(
    "$verbName maps to its agent-run-journal contract operation",
    async (testCase) => {
      await withJournalHarness(async (productDir) => {
        await testCase.exercise(productDir);
      });
    },
  );
});
