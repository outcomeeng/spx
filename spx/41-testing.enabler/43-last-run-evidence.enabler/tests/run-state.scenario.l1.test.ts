import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createTestRunDirectory,
  DEFAULT_TESTING_STORAGE,
  formatTestRunTimestamp,
  readTestingBranchRuns,
  selectLatestTerminalTestRun,
  TESTING_RUN_STATE_ERROR,
  TESTING_RUN_STATE_INCOMPLETE_REASON,
  type TestRunDirectoryEntry,
  type TestRunState,
  type TestRunStateFileSystem,
  writeTerminalTestRunState,
} from "@/testing/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleTestRunStateValue, TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import {
  testingBranchRunsDir,
  withTestingTempProductDir,
  writeTestingStateFile,
} from "@testing/harnesses/testing/harness";

function withBranchSlug(state: TestRunState, branchSlug: string): TestRunState {
  return { ...state, branchSlug };
}

// A read-failing filesystem double (Stage 5 exception 1: failure simulation) — the
// directory listing succeeds but reading the state file raises a non-ENOENT error.
function createReadFailingFileSystem(
  runDirectoryName: string,
  error: Error & { readonly code: string },
): TestRunStateFileSystem {
  const entries: readonly TestRunDirectoryEntry[] = [{ name: runDirectoryName, isDirectory: () => true }];
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    readFile: () => Promise.reject(error),
    readdir: () => Promise.resolve(entries),
  };
}

describe("testing last-run state storage", () => {
  it("publishes terminal state at .spx/testing/{branch-slug}/runs/{run-directory}/state.json", async () => {
    const branchSlug = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.branchSlug());
    const state = withBranchSlug(sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState()), branchSlug);

    await withTestingTempProductDir(async (productDir) => {
      const created = await createTestRunDirectory(productDir, branchSlug);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.error);

      const written = await writeTerminalTestRunState(created.value.runDir, state);
      expect(written.ok).toBe(true);
      if (!written.ok) throw new Error(written.error);

      // Build the documented path from the storage segments directly, independent of the
      // module's own path helper, so a join bug in testingRunsDir cannot pass this assertion.
      const expectedPath = join(
        productDir,
        DEFAULT_TESTING_STORAGE.spxDir,
        DEFAULT_TESTING_STORAGE.testingDir,
        branchSlug,
        DEFAULT_TESTING_STORAGE.runsDir,
        created.value.runDirectoryName,
        DEFAULT_TESTING_STORAGE.stateFile,
      );
      expect(written.value).toBe(expectedPath);

      const runs = await readTestingBranchRuns(productDir, branchSlug);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);
      expect(runs.value.terminalRuns.map((run) => run.state)).toEqual([state]);
    });
  });

  it("refuses to overwrite an existing terminal state", async () => {
    const branchSlug = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.branchSlug());
    const first = withBranchSlug(sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState()), branchSlug);
    const second = withBranchSlug(sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState()), branchSlug);

    await withTestingTempProductDir(async (productDir) => {
      const created = await createTestRunDirectory(productDir, branchSlug);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.error);

      const firstWrite = await writeTerminalTestRunState(created.value.runDir, first);
      expect(firstWrite.ok).toBe(true);

      const secondWrite = await writeTerminalTestRunState(created.value.runDir, second);
      expect(secondWrite).toEqual({ ok: false, error: TESTING_RUN_STATE_ERROR.STATE_ALREADY_EXISTS });

      const runs = await readTestingBranchRuns(productDir, branchSlug);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);
      expect(runs.value.terminalRuns.map((run) => run.state)).toEqual([first]);
    });
  });

  it("selects the latest terminal run by completedAt, then startedAt, then run directory name", async () => {
    const branchSlug = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.branchSlug());
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const earlierRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const laterStartedRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const tieBreakerRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());

    await withTestingTempProductDir(async (productDir) => {
      await writeTestingStateFile(
        productDir,
        branchSlug,
        earlierRun,
        JSON.stringify({ ...base, branchSlug, completedAt: baseDate.toISOString(), startedAt: baseDate.toISOString() }),
      );
      const laterCompleted = new Date(baseDate.getTime() + 1).toISOString();
      await writeTestingStateFile(
        productDir,
        branchSlug,
        laterStartedRun,
        JSON.stringify({ ...base, branchSlug, completedAt: laterCompleted, startedAt: baseDate.toISOString() }),
      );
      await writeTestingStateFile(
        productDir,
        branchSlug,
        tieBreakerRun,
        JSON.stringify({
          ...base,
          branchSlug,
          completedAt: laterCompleted,
          startedAt: new Date(baseDate.getTime() + 2).toISOString(),
        }),
      );

      const runs = await readTestingBranchRuns(productDir, branchSlug);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      expect(selectLatestTerminalTestRun(runs.value.terminalRuns)?.runDirectoryName).toBe(tieBreakerRun);
    });
  });

  it("breaks a completedAt and startedAt tie by lexicographic run directory name", async () => {
    const branchSlug = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.branchSlug());
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const sharedStamp = formatTestRunTimestamp(sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate()));
    const runOne = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const runTwo = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const [, lexicographicallyLaterRun] = [runOne, runTwo].sort();
    const tiedState = JSON.stringify({ ...base, branchSlug, completedAt: sharedStamp, startedAt: sharedStamp });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestingStateFile(productDir, branchSlug, runOne, tiedState);
      await writeTestingStateFile(productDir, branchSlug, runTwo, tiedState);

      const runs = await readTestingBranchRuns(productDir, branchSlug);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      expect(selectLatestTerminalTestRun(runs.value.terminalRuns)?.runDirectoryName).toBe(lexicographicallyLaterRun);
    });
  });

  it("classifies missing, parse-invalid, and shape-invalid state files as incomplete evidence", async () => {
    const branchSlug = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.branchSlug());
    const missingRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const parseInvalidRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const shapeInvalidRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const shapeInvalidState = {
      ...sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState()),
      branchSlug,
      status: sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.headSha()),
    };

    await withTestingTempProductDir(async (productDir) => {
      await mkdir(join(testingBranchRunsDir(productDir, branchSlug), missingRun), { recursive: true });
      await writeTestingStateFile(productDir, branchSlug, parseInvalidRun, "{");
      await writeTestingStateFile(productDir, branchSlug, shapeInvalidRun, JSON.stringify(shapeInvalidState));

      const runs = await readTestingBranchRuns(productDir, branchSlug);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      expect(runs.value.terminalRuns).toEqual([]);
      expect(runs.value.incompleteRuns.map((run) => run.reason).sort()).toEqual(
        [
          TESTING_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
          TESTING_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE,
          TESTING_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
        ].sort(),
      );
    });
  });

  it("classifies a state file read failure as IO incomplete evidence", async () => {
    const branchSlug = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.branchSlug());
    const runDirectoryName = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runDirectoryName());
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const errorCode = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const error = Object.assign(new Error(errorCode), { code: errorCode });

    const runs = await readTestingBranchRuns(productDir, branchSlug, {
      fs: createReadFailingFileSystem(runDirectoryName, error),
    });

    expect(runs.ok).toBe(true);
    if (!runs.ok) throw new Error(runs.error);
    expect(runs.value.terminalRuns).toEqual([]);
    expect(runs.value.incompleteRuns).toEqual([
      {
        runDirectoryName,
        runDir: join(testingBranchRunsDir(productDir, branchSlug), runDirectoryName),
        statePath: join(
          testingBranchRunsDir(productDir, branchSlug),
          runDirectoryName,
          DEFAULT_TESTING_STORAGE.stateFile,
        ),
        reason: TESTING_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
        error: errorCode,
      },
    ]);
  });
});
