import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_EXIT_CODE,
  type JournalCliDeps,
  journalListCommand,
  journalReadSetCommand,
} from "@/commands/journal/cli";
import { appendJournalEvent, openJournalRun, sealJournalRun } from "@/commands/journal/runtime";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { verificationLikeJournalTypes } from "@testing/generators/journal/type";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink, withJournalHarness } from "@testing/harnesses/journal/harness";

function localDeps(productDir: string): JournalCliDeps {
  return {
    cwd: productDir,
    env: { backendOverride: JOURNAL_BACKEND.LOCAL, continuousIntegration: false, githubPullRequest: false },
    processEnv: {},
  };
}

describe("journal inspection compliance", () => {
  it.each(verificationLikeJournalTypes())("treats %s as an opaque type scope segment", async (specialType) => {
    const branchSlug = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchSlug());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withJournalHarness(async (productDir) => {
      const opened = await openJournalRun({ productDir, branchSlug, type: specialType });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await appendJournalEvent(opened.value.ref, input, new RecordingJournalStreamSink());
      await sealJournalRun(opened.value.ref);

      const listed = await journalListCommand({ branchSlug, type: specialType }, localDeps(productDir));
      const readSet = await journalReadSetCommand({ branchSlug, type: specialType }, localDeps(productDir));

      expect(listed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(readSet.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(JSON.parse(listed.output)).toEqual([
        expect.objectContaining({
          branchSlug,
          runToken: opened.value.ref.runToken,
          type: specialType,
        }),
      ]);
      expect(JSON.parse(readSet.output)).toEqual([
        {
          events: [expect.objectContaining({ seq: JOURNAL_SEQ_BASE })],
          metadata: expect.objectContaining({
            branchSlug,
            runToken: opened.value.ref.runToken,
            type: specialType,
          }),
          runToken: opened.value.ref.runToken,
        },
      ]);
    });
  });
});
