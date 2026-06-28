import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type JournalEvent } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { hydratePriorRuns } from "@/lib/artifact-journal-store";
import {
  arbitraryJournalEventInputs,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, arbitraryRunToken, sampleGithubSnapshotValue } from "@testing/generators/github-snapshot";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  buildSealedRunBody,
  RESTORED_JOURNAL_RUNS_DIR,
  stageRestoredRun,
} from "@testing/harnesses/restored-journal-artifacts";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("artifact journal store — prior-run hydration", () => {
  it("hydrates a pull request's prior runs at open, replaying each run's events identically", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runTokens = sampleGithubSnapshotValue(fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }));

    // A prior job sealed each run on its runner; the workflow retained the run files.
    const jobFs = createInMemoryStateStoreFileSystem();
    // A fresh job's runner filesystem holds none of the prior runs until the workflow's
    // download step restores them into the staging directory and hydration materializes them.
    const freshFs = createInMemoryStateStoreFileSystem();

    const eventsByToken = new Map<string, readonly JournalEvent[]>();
    for (const runToken of runTokens) {
      const inputs = sampleAgentRunJournalValue(arbitraryJournalEventInputs());
      const { appended, body } = await buildSealedRunBody({
        fs: jobFs,
        runFilePath: journalRunFilePath(runToken),
        runToken,
        inputs,
      });
      await stageRestoredRun({
        fs: freshFs,
        pullNumber,
        type,
        runToken,
        runFilePath: journalRunFilePath(runToken),
        body,
      });
      eventsByToken.set(runToken, appended);
    }

    const hydrated = await hydratePriorRuns({
      fs: freshFs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type,
      runFilePathFor: (runToken) => journalRunFilePath(runToken),
    });

    const byToken = (left: string, right: string): number => left.localeCompare(right);
    expect(hydrated.map((run) => run.runToken).sort(byToken)).toEqual([...runTokens].sort(byToken));
    for (const run of hydrated) {
      const reopened = createAppendableJournalStore({ runFilePath: run.runFilePath, fs: freshFs });
      expect(await reopened.readAll()).toEqual(eventsByToken.get(run.runToken));
    }
  });
});
