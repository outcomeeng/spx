import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_BACKEND_KIND } from "@/lib/agent-run-journal";
import {
  artifactJournalRunArtifactName,
  createArtifactJournalStore,
  hydratePriorRuns,
} from "@/lib/artifact-journal-store";
import {
  arbitraryJournalEventInput,
  arbitraryJournalEventInputs,
  journalRunFilePath,
  sampleAgentRunJournalValue,
} from "@testing/generators/agent-run-journal";
import { arbitraryPullNumber, arbitraryRunToken, sampleGithubSnapshotValue } from "@testing/generators/github-snapshot";
import { InMemoryActionsArtifactClient } from "@testing/harnesses/actions-artifact-client";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

describe("artifact journal store — compliance", () => {
  it("appends to the runner-local journal with no network write, retaining the run once at seal", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());
    const inputs = sampleAgentRunJournalValue(fc.array(arbitraryJournalEventInput(), { minLength: 1, maxLength: 5 }));

    const artifactClient = new InMemoryActionsArtifactClient();
    const journal = createJournal(
      createArtifactJournalStore({
        runFilePath: journalRunFilePath(runToken),
        fs: createInMemoryStateStoreFileSystem(),
        artifactClient,
        pullNumber,
        runToken,
      }),
      { streamid: runToken, runid: runToken },
    );

    for (const input of inputs) await journal.append(input);
    // Every append targets the runner-local file; nothing reaches the durable store yet.
    expect(artifactClient.uploads).toHaveLength(0);

    await journal.seal();
    // Durable retention happens exactly once, at seal.
    expect(artifactClient.uploads).toHaveLength(1);
  });

  it("retains each sealed run as a distinct per-run artifact addressed by its pull request and run token", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const artifactClient = new InMemoryActionsArtifactClient();
    const journal = createJournal(
      createArtifactJournalStore({
        runFilePath: journalRunFilePath(runToken),
        fs: createInMemoryStateStoreFileSystem(),
        artifactClient,
        pullNumber,
        runToken,
      }),
      { streamid: runToken, runid: runToken },
    );
    await journal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()));
    await journal.seal();

    expect(artifactClient.uploads[0]?.name).toBe(artifactJournalRunArtifactName({ pullNumber, runToken }));
  });

  it("skips a prior run whose artifact retention has expired when hydrating", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const [liveToken, expiredToken] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }),
    );

    const artifactClient = new InMemoryActionsArtifactClient();
    const jobFs = createInMemoryStateStoreFileSystem();

    // A retained, still-live prior run.
    const liveJournal = createJournal(
      createArtifactJournalStore({
        runFilePath: journalRunFilePath(liveToken),
        fs: jobFs,
        artifactClient,
        pullNumber,
        runToken: liveToken,
      }),
      { streamid: liveToken, runid: liveToken },
    );
    for (const input of sampleAgentRunJournalValue(arbitraryJournalEventInputs())) {
      await liveJournal.append(input);
    }
    await liveJournal.seal();

    // A prior run whose artifact retention window has lapsed.
    artifactClient.seed({
      name: artifactJournalRunArtifactName({ pullNumber, runToken: expiredToken }),
      body: "",
      expired: true,
    });

    const freshFs = createInMemoryStateStoreFileSystem();
    const hydrated = await hydratePriorRuns({
      artifactClient,
      fs: freshFs,
      pullNumber,
      runFilePathFor: (token) => journalRunFilePath(token),
    });

    // Only the still-retained run is hydrated; the expired one is skipped, not a failure.
    expect(hydrated.map((run) => run.runToken)).toEqual([liveToken]);
  });

  it("declares its kind as Appendable", () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());
    const store = createArtifactJournalStore({
      runFilePath: journalRunFilePath(runToken),
      fs: createInMemoryStateStoreFileSystem(),
      artifactClient: new InMemoryActionsArtifactClient(),
      pullNumber,
      runToken,
    });
    expect(store.kind).toBe(JOURNAL_BACKEND_KIND.APPENDABLE);
  });
});
