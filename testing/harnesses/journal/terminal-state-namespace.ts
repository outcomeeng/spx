import * as fc from "fast-check";
import { expect } from "vitest";

import {
  JOURNAL_CLI_EXIT_CODE,
  type JournalCliDeps,
  journalListCommand,
  journalRenderCommand,
} from "@/commands/journal/cli";
import { appendJournalEvent, openJournalRun, sealJournalRun } from "@/commands/journal/runtime";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import {
  foldJournalRunState,
  JOURNAL_RUN_EVENT_TYPE_SUFFIX,
  JOURNAL_RUN_STATE_STATUS,
  journalRunEventInput,
  type JournalRunStateStatus,
} from "@/domains/journal/run-state";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { JOURNAL_RUN_STATE_TEST_GENERATOR } from "@testing/generators/journal/run-state";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";

function localDeps(productDir: string): JournalCliDeps {
  return {
    cwd: productDir,
    env: { backendOverride: JOURNAL_BACKEND.LOCAL, continuousIntegration: false, githubPullRequest: false },
    processEnv: {},
  };
}

function expectedCompletedType(namespace: string): string {
  return `${namespace}${JOURNAL_RUN_EVENT_TYPE_SUFFIX.COMPLETED}`;
}

export function assertFoldAcceptsNonDefaultCompletionNamespace(): void {
  fc.assert(
    fc.property(
      JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState().chain((state) =>
        JOURNAL_RUN_STATE_TEST_GENERATOR.completedEventNamespace().map((namespace) => ({
          state,
          events: [
            JOURNAL_RUN_STATE_TEST_GENERATOR.completedEventWithNamespace(
              JOURNAL_SEQ_BASE,
              namespace,
              state,
            ),
          ],
          namespace,
        }))
      ),
      ({ state, events, namespace }) => {
        const result = foldJournalRunState(events, true);

        expect(events[0]?.type).toBe(expectedCompletedType(namespace));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toEqual(state);
      },
    ),
  );
}

export async function assertListAndRenderShareNonDefaultTerminalState(): Promise<void> {
  const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
  const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
  const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
  const namespace = sampleStateStoreTestValue(JOURNAL_RUN_STATE_TEST_GENERATOR.completedEventNamespace());
  const terminalState = sampleStateStoreTestValue(
    JOURNAL_RUN_STATE_TEST_GENERATOR.journalRunState().map((state) => ({
      ...state,
      status: JOURNAL_RUN_STATE_STATUS.APPROVED,
    })),
  );

  await withJournalHarness(async (productDir) => {
    const opened = await openJournalRun({ productDir, branchSlug, type });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await appendJournalEvent(opened.value.ref, input, new RecordingJournalStreamSink());
    await appendJournalEvent(
      opened.value.ref,
      journalRunEventInput(expectedCompletedType(namespace), terminalState, input),
      new RecordingJournalStreamSink(),
    );
    await sealJournalRun(opened.value.ref);

    const listed = await journalListCommand(
      {
        branchSlug,
        type,
        terminalState: JOURNAL_RUN_STATE_STATUS.APPROVED,
      },
      localDeps(productDir),
    );
    const rendered = await journalRenderCommand(
      { branchSlug, type, runToken: opened.value.ref.runToken },
      localDeps(productDir),
    );

    expect(listed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
    expect(rendered.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
    const runs = JSON.parse(listed.output) as Array<{
      readonly runToken: string;
      readonly terminalState: JournalRunStateStatus;
    }>;
    const events = JSON.parse(rendered.output) as JournalEvent[];
    expect(runs).toEqual([
      expect.objectContaining({
        runToken: opened.value.ref.runToken,
        terminalState: JOURNAL_RUN_STATE_STATUS.APPROVED,
      }),
    ]);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        type: expectedCompletedType(namespace),
      }),
    );
  });
}
