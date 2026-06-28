import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createJournal, JOURNAL_ERROR } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  artifactJournalRunArtifactName,
  artifactJournalScopePrefix,
  hydratePriorRuns,
} from "@/lib/artifact-journal-store";
import {
  arbitraryJournalEventInput,
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

/** Stage one sealed prior run from a job filesystem into a fresh runner's staging directory. */
async function stageSealedPriorRun(args: {
  jobFs: ReturnType<typeof createInMemoryStateStoreFileSystem>;
  freshFs: ReturnType<typeof createInMemoryStateStoreFileSystem>;
  pullNumber: number;
  type: string;
  runToken: string;
}): Promise<void> {
  const runFilePath = journalRunFilePath(args.runToken);
  const { body } = await buildSealedRunBody({
    fs: args.jobFs,
    runFilePath,
    runToken: args.runToken,
    inputs: [sampleAgentRunJournalValue(arbitraryJournalEventInput())],
  });
  await stageRestoredRun({
    fs: args.freshFs,
    pullNumber: args.pullNumber,
    type: args.type,
    runToken: args.runToken,
    runFilePath,
    body,
  });
}

describe("artifact journal store — compliance", () => {
  it("addresses the per-run artifact by pull request, type, and run token, so any one distinguishes it", () => {
    const [pullNumber, otherPull] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryPullNumber(), { minLength: 2, maxLength: 2 }),
    );
    const [type, otherType] = sampleStateStoreTestValue(
      fc.uniqueArray(STATE_STORE_TEST_GENERATOR.scopeToken(), { minLength: 2, maxLength: 2 }),
    );
    const [runToken, otherToken] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }),
    );

    // Each component participates in the name: changing any one yields a different artifact,
    // so two runs differing in pull request, type, or run token never collide.
    const name = artifactJournalRunArtifactName({ pullNumber, type, runToken });
    expect(artifactJournalRunArtifactName({ pullNumber: otherPull, type, runToken })).not.toBe(name);
    expect(artifactJournalRunArtifactName({ pullNumber, type: otherType, runToken })).not.toBe(name);
    expect(artifactJournalRunArtifactName({ pullNumber, type, runToken: otherToken })).not.toBe(name);
  });

  it("hydrates only the run's own verification type, never another type's runs of the same pull request", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const [typeA, typeB] = sampleStateStoreTestValue(
      fc.uniqueArray(STATE_STORE_TEST_GENERATOR.scopeToken(), { minLength: 2, maxLength: 2 }),
    );
    const [tokenA, tokenB] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }),
    );

    const jobFs = createInMemoryStateStoreFileSystem();
    const freshFs = createInMemoryStateStoreFileSystem();
    // Two runs of the same pull request but different verification types, both restored.
    await stageSealedPriorRun({ jobFs, freshFs, pullNumber, type: typeA, runToken: tokenA });
    await stageSealedPriorRun({ jobFs, freshFs, pullNumber, type: typeB, runToken: tokenB });

    // Hydrating type A materializes only type A's run — type B's is in a disjoint name space.
    const hydrated = await hydratePriorRuns({
      fs: freshFs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type: typeA,
      runFilePathFor: (token) => journalRunFilePath(token),
    });
    expect(hydrated.map((run) => run.runToken)).toEqual([tokenA]);
  });

  it("skips a restored run whose run-token segment is not a valid scope token", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());

    const fs = createInMemoryStateStoreFileSystem();
    // A network-sourced artifact whose run-token segment is a traversal sequence; it matches
    // the scope prefix but must never reach the filesystem as a run path.
    const adversarialName = `${artifactJournalScopePrefix({ pullNumber, type })}..`;
    await fs.mkdir(`${RESTORED_JOURNAL_RUNS_DIR}/${adversarialName}`, { recursive: true });

    let pathRequested = false;
    const hydrated = await hydratePriorRuns({
      fs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type,
      runFilePathFor: (token) => {
        pathRequested = true;
        return journalRunFilePath(token);
      },
    });

    // The malformed artifact is skipped before any run path is built or read.
    expect(hydrated).toEqual([]);
    expect(pathRequested).toBe(false);
  });

  it("materializes a restored prior run as sealed, rejecting a further append", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const jobFs = createInMemoryStateStoreFileSystem();
    const freshFs = createInMemoryStateStoreFileSystem();
    await stageSealedPriorRun({ jobFs, freshFs, pullNumber, type, runToken });

    const [hydratedRun] = await hydratePriorRuns({
      fs: freshFs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type,
      runFilePathFor: (token) => journalRunFilePath(token),
    });

    // The hydrated run carries the durable record's terminal seal.
    const reopened = createAppendableJournalStore({ runFilePath: hydratedRun.runFilePath, fs: freshFs });
    expect(await reopened.isSealed()).toBe(true);

    const reopenedJournal = createJournal(reopened, { streamid: runToken, runid: runToken });
    await expect(reopenedJournal.append(sampleAgentRunJournalValue(arbitraryJournalEventInput()))).rejects.toThrow(
      JOURNAL_ERROR.SEALED,
    );
  });

  it("materializes exactly the restored runs — a prior run the workflow did not restore is absent", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const [restoredToken] = sampleGithubSnapshotValue(
      fc.uniqueArray(arbitraryRunToken(), { minLength: 2, maxLength: 2 }),
    );

    const jobFs = createInMemoryStateStoreFileSystem();
    const freshFs = createInMemoryStateStoreFileSystem();
    // Only one of the pull request's prior runs is restored; the other's artifact expired or
    // was pruned, so the workflow's download step never staged it.
    await stageSealedPriorRun({ jobFs, freshFs, pullNumber, type, runToken: restoredToken });

    const hydrated = await hydratePriorRuns({
      fs: freshFs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type,
      runFilePathFor: (token) => journalRunFilePath(token),
    });

    // The materialized set is exactly the restored runs — the unrestored prior is absent, not a failure.
    expect(hydrated.map((run) => run.runToken)).toEqual([restoredToken]);
  });

  it("skips a staging entry that is a plain file rather than an artifact directory", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const fs = createInMemoryStateStoreFileSystem();
    // A staging entry with a valid prefix and run token but which is a plain file, not the
    // artifact subdirectory `actions/download-artifact` restores; it is not a restored run,
    // so hydration skips it rather than reading it as one and failing the opening run.
    await fs.mkdir(RESTORED_JOURNAL_RUNS_DIR, { recursive: true });
    await fs.writeFile(
      `${RESTORED_JOURNAL_RUNS_DIR}/${artifactJournalRunArtifactName({ pullNumber, type, runToken })}`,
      "",
    );

    let pathRequested = false;
    const hydrated = await hydratePriorRuns({
      fs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type,
      runFilePathFor: (token) => {
        pathRequested = true;
        return journalRunFilePath(token);
      },
    });

    // The file entry is skipped before any run path is built or read.
    expect(hydrated).toEqual([]);
    expect(pathRequested).toBe(false);
  });

  it("skips a restored artifact directory that does not hold its run file", async () => {
    const pullNumber = sampleGithubSnapshotValue(arbitraryPullNumber());
    const type = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken());
    const runToken = sampleGithubSnapshotValue(arbitraryRunToken());

    const fs = createInMemoryStateStoreFileSystem();
    // A restored artifact directory with a valid prefix and run token but holding no run
    // file — an empty or truncated upload `actions/download-artifact` still restores as a
    // directory; hydration skips it rather than throwing on the missing run file.
    await fs.mkdir(`${RESTORED_JOURNAL_RUNS_DIR}/${artifactJournalRunArtifactName({ pullNumber, type, runToken })}`, {
      recursive: true,
    });

    const hydrated = await hydratePriorRuns({
      fs,
      restoredRunsDir: RESTORED_JOURNAL_RUNS_DIR,
      pullNumber,
      type,
      runFilePathFor: (token) => journalRunFilePath(token),
    });

    // The malformed artifact directory is absent from the materialized set, not a failure.
    expect(hydrated).toEqual([]);
  });
});
