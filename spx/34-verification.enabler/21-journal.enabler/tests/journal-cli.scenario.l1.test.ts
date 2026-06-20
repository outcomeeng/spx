import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_EXIT_CODE,
  journalAppendCommand,
  type JournalCliDeps,
  journalOpenCommand,
  journalReadCommand,
  journalRenderCommand,
  journalSealCommand,
} from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
import { withGitEnv } from "@testing/harnesses/with-git-env";

function localDeps(path: string): JournalCliDeps {
  return {
    cwd: path,
    env: { backendOverride: JOURNAL_BACKEND.LOCAL, continuousIntegration: false, githubPullRequest: false },
    processEnv: {},
  };
}

describe("journal CLI", () => {
  it("opens, appends, reads, seals, and renders a run resolved from the git environment", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withGitEnv(async ({ path }) => {
      const deps = localDeps(path);

      const opened = await journalOpenCommand({ type }, deps);
      expect(opened.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const { runToken } = JSON.parse(opened.output) as { runToken: string };

      const sink = new RecordingJournalStreamSink();
      const appended = await journalAppendCommand({ type, runToken }, input, { localSink: sink }, deps);
      expect(appended.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(sink.emitted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);

      const read = await journalReadCommand({ type, runToken }, JOURNAL_SEQ_BASE, deps);
      expect(read.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect((JSON.parse(read.output) as JournalEvent[]).map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);

      const sealed = await journalSealCommand({ type, runToken }, deps);
      expect(sealed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);

      const afterSeal = await journalAppendCommand({ type, runToken }, input, { localSink: sink }, deps);
      expect(afterSeal.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.ERROR);

      const rendered = await journalRenderCommand({ type, runToken }, deps);
      expect(rendered.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect((JSON.parse(rendered.output) as JournalEvent[]).map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
    });
  });
});
