import { describe, expect, it } from "vitest";

import {
  JOURNAL_CLI_ENV,
  JOURNAL_CLI_ERROR,
  JOURNAL_CLI_EXIT_CODE,
  journalAppendCommand,
  type JournalCliDeps,
  journalCommentMarker,
  journalOpenCommand,
  journalReadCommand,
} from "@/commands/journal/cli";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { artifactJournalRunArtifactName } from "@/lib/artifact-journal-store";
import { runFileName } from "@/lib/state-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalEventInputs,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, arbitraryRunToken, sampleGithubSnapshotValue } from "@testing/generators/github-snapshot";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { RecordingGithubSnapshotClient } from "@testing/harnesses/github-snapshot-client";
import { failingGitDependencies, RecordingJournalStreamSink } from "@testing/harnesses/journal/harness";
import {
  buildSealedRunBody,
  RESTORED_JOURNAL_RUNS_DIR,
  stageRestoredRun,
} from "@testing/harnesses/restored-journal-artifacts";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { withGitEnv } from "@testing/harnesses/with-git-env";

describe("journal CLI github-pr backend", () => {
  it("streams a rendered projection to the run's pull-request comment", async () => {
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
        { localSink: new RecordingJournalStreamSink(), githubClient, githubRepository: "owner/repo" },
        deps,
      );
      expect(appended.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
      // append's projection reaches the pull-request comment, so its result is empty.
      expect(appended.output).toHaveLength(0);

      expect(githubClient.comments).toHaveLength(1);
      const comment = githubClient.comments[0];
      expect(comment?.pullNumber).toBe(pullNumber);
      expect(comment?.marker).toBe(journalCommentMarker(type, runToken));
      const persisted = JSON.parse(comment?.body ?? "[]") as JournalEvent[];
      expect(persisted.map((event) => event.seq)).toEqual([JOURNAL_SEQ_BASE]);
    });
  });

  it("rejects a github-pr append when GITHUB_REPOSITORY is absent", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const input = sampleAgentRunJournalValue(arbitraryJournalEventInput());
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());

    await withGitEnv(async ({ path }) => {
      const deps: JournalCliDeps = {
        cwd: path,
        env: { backendOverride: JOURNAL_BACKEND.GITHUB_PR, continuousIntegration: true, githubPullRequest: true },
        processEnv: { GITHUB_REF: `refs/pull/${pullNumber}/merge` },
      };

      const opened = await journalOpenCommand({ type }, deps);
      const { runToken } = JSON.parse(opened.output) as { runToken: string };

      // The pull request number resolves, but the repository is empty — the verb
      // must report the misconfiguration, not silently drop the comment.
      const appended = await journalAppendCommand(
        { type, runToken },
        input,
        {
          localSink: new RecordingJournalStreamSink(),
          githubClient: new RecordingGithubSnapshotClient(),
          githubRepository: "",
        },
        deps,
      );

      expect(appended.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.ERROR);
      expect(appended.output).toBe(JOURNAL_CLI_ERROR.GITHUB_REPOSITORY_MISSING);
    });
  });

  it("hydrates the pull request's prior runs and reports the run's artifact name on open", async () => {
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const priorToken = sampleGithubSnapshotValue(arbitraryRunToken());
    const priorInputs = sampleAgentRunJournalValue(arbitraryJournalEventInputs());

    // A prior job sealed a run of this type on this pull request; the verification
    // workflow's download step restored its artifact into the staging directory this
    // fresh job reads. The whole exchange runs over one injected in-memory filesystem.
    const fs = createInMemoryStateStoreFileSystem();
    const { appended: priorEvents, body } = await buildSealedRunBody({
      fs,
      runFilePath: runFileName(priorToken),
      runToken: priorToken,
      inputs: priorInputs,
    });
    await stageRestoredRun({ fs, pullNumber, type, runToken: priorToken, runFilePath: runFileName(priorToken), body });

    const deps: JournalCliDeps = {
      cwd: "/workspace",
      // git is unavailable, so scope resolution falls back to cwd and the fixed branch identity.
      git: failingGitDependencies(),
      env: { backendOverride: JOURNAL_BACKEND.GITHUB_PR, continuousIntegration: true, githubPullRequest: true },
      processEnv: {
        [JOURNAL_CLI_ENV.GITHUB_REF]: `refs/pull/${pullNumber}/merge`,
        [JOURNAL_CLI_ENV.RESTORED_RUNS_DIR]: RESTORED_JOURNAL_RUNS_DIR,
      },
      fs,
    };

    const opened = await journalOpenCommand({ type }, deps);
    expect(opened.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
    const { runToken, artifactName } = JSON.parse(opened.output) as { runToken: string; artifactName: string };

    // open reports this run's per-run artifact name for the workflow's upload step.
    expect(artifactName).toBe(artifactJournalRunArtifactName({ pullNumber, type, runToken }));

    // the prior run is hydrated into the runs directory, so it reads back through the journal.
    const read = await journalReadCommand({ type, runToken: priorToken }, String(JOURNAL_SEQ_BASE), deps);
    expect(read.exitCode).toBe(JOURNAL_CLI_EXIT_CODE.OK);
    expect((JSON.parse(read.output) as JournalEvent[]).map((event) => event.seq)).toEqual(
      priorEvents.map((event) => event.seq),
    );
  });
});
