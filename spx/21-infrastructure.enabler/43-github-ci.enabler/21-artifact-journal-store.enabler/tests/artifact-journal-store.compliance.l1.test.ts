import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  type ActionsArtifactClient,
  type ActionsArtifactSummary,
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
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { InMemoryActionsArtifactClient } from "@testing/harnesses/actions-artifact-client";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

/** An artifact client whose upload always fails, exercising the retention-failure path through DI. */
class UploadFailingArtifactClient implements ActionsArtifactClient {
  uploadArtifact(): Promise<void> {
    return Promise.reject(new Error("actions artifact upload unavailable"));
  }
  listArtifacts(): Promise<readonly ActionsArtifactSummary[]> {
    return Promise.resolve([]);
  }
  downloadArtifact(): Promise<string> {
    return Promise.reject(new Error("actions artifact unavailable"));
  }
}

/** An artifact client whose first uploads fail and later uploads succeed, exercising retention retry through DI. */
class FlakyUploadArtifactClient implements ActionsArtifactClient {
  private failuresRemaining: number;
  private readonly inner = new InMemoryActionsArtifactClient();

  constructor(failuresBeforeSuccess: number) {
    this.failuresRemaining = failuresBeforeSuccess;
  }

  get uploads(): ReadonlyArray<{ name: string; body: string }> {
    return this.inner.uploads;
  }

  async uploadArtifact(args: { name: string; body: string }): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("actions artifact upload temporarily unavailable");
    }
    await this.inner.uploadArtifact(args);
  }

  listArtifacts(args: { namePrefix: string }): Promise<readonly ActionsArtifactSummary[]> {
    return this.inner.listArtifacts(args);
  }

  downloadArtifact(args: { name: string }): Promise<string> {
    return this.inner.downloadArtifact(args);
  }
}

describe("artifact journal store — compliance", () => {
  it("appends to the runner-local journal with no network write, retaining the run once at seal", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());
    const inputs = sampleAgentRunJournalValue(fc.array(arbitraryJournalEventInput(), { minLength: 1, maxLength: 5 }));

    const artifactClient = new InMemoryActionsArtifactClient();
    const journal = createJournal(
      createArtifactJournalStore({
        runFilePath: journalRunFilePath(runToken),
        fs: createInMemoryStateStoreFileSystem(),
        artifactClient,
        pullNumber,
        type,
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

  it("addresses the retained artifact by pull request, type, and run token, so any one distinguishes it", () => {
    const [pullNumber, otherPull] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryPullNumber(), { minLength: 2, maxLength: 2 }),
    );
    const [type, otherType] = sampleStateStoreTestValue(
      fc.uniqueArray(STATE_STORE_TEST_GENERATOR.scopeToken(), { minLength: 2, maxLength: 2 }),
    );
    const [runToken, otherToken] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }),
    );

    // Each component participates in the name: changing any one yields a different
    // artifact, so two runs differing in pull request, type, or run token never collide.
    const name = artifactJournalRunArtifactName({ pullNumber, type, runToken });
    expect(artifactJournalRunArtifactName({ pullNumber: otherPull, type, runToken })).not.toBe(name);
    expect(artifactJournalRunArtifactName({ pullNumber, type: otherType, runToken })).not.toBe(name);
    expect(artifactJournalRunArtifactName({ pullNumber, type, runToken: otherToken })).not.toBe(name);
  });

  it("re-seals an already-retained run as a no-op, uploading no second artifact", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const artifactClient = new InMemoryActionsArtifactClient();
    const store = createArtifactJournalStore({
      runFilePath: journalRunFilePath(runToken),
      fs: createInMemoryStateStoreFileSystem(),
      artifactClient,
      pullNumber,
      type,
      runToken,
    });
    const journal = createJournal(store, { streamid: runToken, runid: runToken });
    await journal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()));

    await store.seal();
    await store.seal();

    // The retry retains nothing new — a duplicate artifact name would conflict.
    expect(artifactClient.uploads).toHaveLength(1);
  });

  it("seals terminally before retention, so a failed seal cannot be followed by a diverging append", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const store = createArtifactJournalStore({
      runFilePath: journalRunFilePath(runToken),
      fs: createInMemoryStateStoreFileSystem(),
      artifactClient: new UploadFailingArtifactClient(),
      pullNumber,
      type,
      runToken,
    });
    const journal = createJournal(store, { streamid: runToken, runid: runToken });
    await journal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()));

    // The seal marker is written before retention, so even when the upload fails the
    // run is terminally sealed and rejects a further append — the local body cannot
    // grow to diverge from the history a retry will retain.
    await expect(store.seal()).rejects.toThrow();
    expect(await store.isSealed()).toBe(true);
    await expect(journal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()))).rejects.toThrow(
      JOURNAL_ERROR.SEALED,
    );
  });

  it("re-attempts retention on a later seal when a prior retention failed", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const artifactClient = new FlakyUploadArtifactClient(1);
    const store = createArtifactJournalStore({
      runFilePath: journalRunFilePath(runToken),
      fs: createInMemoryStateStoreFileSystem(),
      artifactClient,
      pullNumber,
      type,
      runToken,
    });
    const journal = createJournal(store, { streamid: runToken, runid: runToken });
    await journal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()));

    // First seal: terminally sealed, but the upload fails — sealed-but-unretained.
    await expect(store.seal()).rejects.toThrow();
    expect(await store.isSealed()).toBe(true);
    expect(artifactClient.uploads).toHaveLength(0);

    // A later seal re-attempts retention independently of the seal marker.
    await store.seal();
    expect(artifactClient.uploads).toHaveLength(1);
  });

  it("skips a prior run whose artifact retention has expired when hydrating", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
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
        type,
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
      name: artifactJournalRunArtifactName({ pullNumber, type, runToken: expiredToken }),
      body: "",
      expired: true,
    });

    const freshFs = createInMemoryStateStoreFileSystem();
    const hydrated = await hydratePriorRuns({
      artifactClient,
      fs: freshFs,
      pullNumber,
      type,
      runFilePathFor: (token) => journalRunFilePath(token),
    });

    // Only the still-retained run is hydrated; the expired one is skipped, not a failure.
    expect(hydrated.map((run) => run.runToken)).toEqual([liveToken]);
  });

  it("replays a hydrated prior run as sealed, rejecting a further append", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const artifactClient = new InMemoryActionsArtifactClient();
    const jobFs = createInMemoryStateStoreFileSystem();
    const journal = createJournal(
      createArtifactJournalStore({
        runFilePath: journalRunFilePath(runToken),
        fs: jobFs,
        artifactClient,
        pullNumber,
        type,
        runToken,
      }),
      { streamid: runToken, runid: runToken },
    );
    for (const input of sampleAgentRunJournalValue(arbitraryJournalEventInputs())) await journal.append(input);
    await journal.seal();

    const freshFs = createInMemoryStateStoreFileSystem();
    const [hydratedRun] = await hydratePriorRuns({
      artifactClient,
      fs: freshFs,
      pullNumber,
      type,
      runFilePathFor: (token) => journalRunFilePath(token),
    });

    // The hydrated run carries the durable record's terminal seal.
    const reopened = createAppendableJournalStore({ runFilePath: hydratedRun.runFilePath, fs: freshFs });
    expect(await reopened.isSealed()).toBe(true);

    // A journal bound to the reopened sealed run rejects a further append.
    const reopenedJournal = createJournal(reopened, { streamid: runToken, runid: runToken });
    await expect(reopenedJournal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()))).rejects.toThrow(
      JOURNAL_ERROR.SEALED,
    );
  });

  it("hydrates only the run's own verification type, never another type's runs of the same pull request", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const [typeA, typeB] = sampleStateStoreTestValue(
      fc.uniqueArray(STATE_STORE_TEST_GENERATOR.scopeToken(), { minLength: 2, maxLength: 2 }),
    );
    const [tokenA, tokenB] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }),
    );

    const artifactClient = new InMemoryActionsArtifactClient();
    const jobFs = createInMemoryStateStoreFileSystem();

    // Two runs of the same pull request but different verification types.
    for (const run of [{ type: typeA, runToken: tokenA }, { type: typeB, runToken: tokenB }]) {
      const journal = createJournal(
        createArtifactJournalStore({
          runFilePath: journalRunFilePath(run.runToken),
          fs: jobFs,
          artifactClient,
          pullNumber,
          type: run.type,
          runToken: run.runToken,
        }),
        { streamid: run.runToken, runid: run.runToken },
      );
      await journal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()));
      await journal.seal();
    }

    // Hydrating type A must materialize only type A's run — type B's is in a disjoint name space.
    const freshFs = createInMemoryStateStoreFileSystem();
    const hydrated = await hydratePriorRuns({
      artifactClient,
      fs: freshFs,
      pullNumber,
      type: typeA,
      runFilePathFor: (token) => journalRunFilePath(token),
    });
    expect(hydrated.map((run) => run.runToken)).toEqual([tokenA]);
  });
});
