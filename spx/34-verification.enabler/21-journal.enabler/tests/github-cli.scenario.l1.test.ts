import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_EXIT_CODE,
  journalAppendCommand,
  type JournalCliDeps,
  journalCommentMarker,
  journalOpenCommand,
} from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { arbitraryJournalEventInput, sampleAgentRunJournalValue } from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, sampleGithubSnapshotValue } from "@testing/generators/github-snapshot";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingGithubSnapshotClient } from "@testing/harnesses/github-snapshot-client";
import { RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
import { withGitEnv } from "@testing/harnesses/with-git-env";

describe("journal CLI github-pr backend", () => {
  it("streams an appended event to the run's pull-request comment", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());

    await withGitEnv(async ({ path }) => {
      const githubClient = new RecordingGithubSnapshotClient();
      const deps: JournalCliDeps = {
        cwd: path,
        env: { backendOverride: JOURNAL_BACKEND.GITHUB_PR, continuousIntegration: true, githubPullRequest: true },
        processEnv: { GITHUB_REF: `refs/pull/${pullNumber}/merge` },
      };

      const opened = await journalOpenCommand({ type }, deps);
      expect(opened.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      const { runToken } = JSON.parse(opened.output) as { runToken: string };

      const appended = await journalAppendCommand(
        { type, runToken },
        input,
        { localSink: new RecordingJournalStreamSink(), githubClient },
        deps,
      );
      expect(appended.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);

      expect(githubClient.comments).toHaveLength(1);
      const comment = githubClient.comments[0];
      expect(comment?.pullNumber).toBe(pullNumber);
      expect(comment?.marker).toBe(journalCommentMarker(type, runToken));
      const persisted = JSON.parse(comment?.body ?? "[]") as JournalEvent[];
      expect(persisted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
    });
  });
});
