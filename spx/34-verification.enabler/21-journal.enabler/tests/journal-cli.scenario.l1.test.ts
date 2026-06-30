import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_ERROR,
  JOURNAL_CLI_EXIT_CODE,
  journalAppendCommand,
  type JournalCliDeps,
  journalListCommand,
  journalOpenCommand,
  journalReadCommand,
  journalReadSetCommand,
  journalRenderCommand,
  journalSealCommand,
} from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { failingGitDependencies, RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
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
      // append's output is the streamed event, not a result line — its result is empty.
      expect(appended.output).toHaveLength(0);
      expect(sink.emitted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);

      const read = await journalReadCommand({ type, runToken }, String(JOURNAL_SEQ_BASE), deps);
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

  it("rejects an append whose event input lacks a required CloudEvents field", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runToken());

    await withGitEnv(async ({ path }) => {
      const deps = localDeps(path);
      const sink = new RecordingJournalStreamSink();
      const appended = await journalAppendCommand({ type, runToken }, {}, { localSink: sink }, deps);

      expect(appended.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.ERROR);
      expect(appended.output).toBe(JOURNAL_CLI_ERROR.INVALID_EVENT_INPUT);
      expect(sink.emitted).toHaveLength(0);
    });
  });

  it("operates under the fallback branch identity when git is unavailable", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());

    await withGitEnv(async ({ path }) => {
      // A git runner that always fails, standing in for git not being installed:
      // the root resolver falls back to cwd and the verbs must not throw.
      const warnings: string[] = [];
      const noGit: JournalCliDeps = {
        ...localDeps(path),
        git: failingGitDependencies(),
        onWarning: (warning) => {
          if (warning !== undefined) warnings.push(warning);
        },
      };

      const opened = await journalOpenCommand({ type }, noGit);
      expect(opened.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const { runToken } = JSON.parse(opened.output) as { runToken: string };

      const appended = await journalAppendCommand(
        { type, runToken },
        input,
        { localSink: new RecordingJournalStreamSink() },
        noGit,
      );
      expect(appended.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      expect(appended.output).toHaveLength(0);

      // The remaining verbs share the same git-free scope resolution and must also succeed.
      const read = await journalReadCommand({ type, runToken }, String(JOURNAL_SEQ_BASE), noGit);
      expect(read.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);

      const sealed = await journalSealCommand({ type, runToken }, noGit);
      expect(sealed.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);

      const rendered = await journalRenderCommand({ type, runToken }, noGit);
      expect(rendered.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);

      const warningCountBeforeInspection = warnings.length;
      const listed = await journalListCommand({ type }, noGit);
      const readSet = await journalReadSetCommand({ type }, noGit);
      const inspectionResults = [listed, readSet];

      for (const result of inspectionResults) {
        expect(result.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      }
      expect(warnings.slice(warningCountBeforeInspection)).toHaveLength(inspectionResults.length);
    });
  });

  it("rejects a read whose cursor is not a whole non-negative integer", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.runToken());

    await withGitEnv(async ({ path }) => {
      const deps = localDeps(path);
      const read = await journalReadCommand({ type, runToken }, "nope", deps);

      expect(read.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.ERROR);
      expect(read.output).toBe(JOURNAL_CLI_ERROR.INVALID_CURSOR);
    });
  });
});
