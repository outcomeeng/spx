import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, type JournalEvent } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import { createArtifactJournalStore, hydratePriorRuns } from "@/lib/artifact-journal-store";
import {
  arbitraryJournalEventInputs,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, arbitraryRunToken, sampleGithubSnapshotValue } from "@testing/generators/github-snapshot";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { InMemoryActionsArtifactClient } from "@testing/harnesses/actions-artifact-client";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("artifact journal store — prior-run hydration", () => {
  it("hydrates a pull request's prior runs at open, replaying each run's events identically", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runTokens = sampleGithubSnapshotValue(fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }));

    // The durable GitHub side survives across jobs; the runner filesystem does not.
    const artifactClient = new InMemoryActionsArtifactClient();
    const jobFs = createInMemoryStateStoreFileSystem();

    const eventsByToken = new Map<string, readonly JournalEvent[]>();
    for (const runToken of runTokens) {
      const inputs = sampleAgentRunJournalValue(arbitraryJournalEventInputs());
      const identity = { streamid: runToken, runid: runToken };
      const journal = createJournal(
        createArtifactJournalStore({
          runFilePath: journalRunFilePath(runToken),
          fs: jobFs,
          artifactClient,
          pullNumber,
          type,
          runToken,
        }),
        identity,
      );
      const appended: JournalEvent[] = [];
      for (const input of inputs) appended.push(await journal.append(input));
      await journal.seal();
      eventsByToken.set(runToken, appended);
    }

    // A fresh job's runner filesystem holds none of the prior runs until hydration.
    const freshFs = createInMemoryStateStoreFileSystem();
    const hydrated = await hydratePriorRuns({
      artifactClient,
      fs: freshFs,
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
