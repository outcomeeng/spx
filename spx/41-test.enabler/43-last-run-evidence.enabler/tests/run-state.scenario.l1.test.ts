import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { compareAsciiStrings, STATE_STORE_DOMAIN, STATE_STORE_PATH, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import {
  createTestRunFile,
  formatTestRunTimestamp,
  readTestingRuns,
  selectLatestTerminalTestRunForNode,
  TESTING_RUN_STATE_ERROR,
  TESTING_RUN_STATE_ERROR_CODE,
  TESTING_RUN_STATE_INCOMPLETE_REASON,
  testingRunsDir,
  type TestRunFileEntry,
  type TestRunnerOutcome,
  type TestRunState,
  type TestRunStateFileSystem,
  writeTerminalTestRunState,
} from "@/test/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleTestRunStateValue, TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { withTestingTempProductDir, writeTestingStateFile } from "@testing/harnesses/testing/harness";

// A read-failing filesystem double (Stage 5 exception 1: failure simulation) — the
// file listing succeeds but reading the run file raises a non-ENOENT error.
function createReadFailingFileSystem(
  runFileName: string,
  error: Error & { readonly code: string },
): TestRunStateFileSystem {
  const entries: readonly TestRunFileEntry[] = [{ name: runFileName, isFile: () => true }];
  return {
    mkdir: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    appendFile: () => Promise.resolve(),
    readFile: () => Promise.reject(error),
    readdir: () => Promise.resolve(entries),
    lstat: (path) =>
      Promise.resolve({
        birthtimeMs: 0,
        isDirectory: () => !path.endsWith(runFileName),
        isFile: () => path.endsWith(runFileName),
        isSymbolicLink: () => false,
      }),
    link: () => Promise.resolve(),
    rename: () => Promise.resolve(),
    rm: () => Promise.resolve(),
  };
}

// A runner outcome that executed exactly the given node test paths.
function outcomeCovering(testPaths: readonly string[]): TestRunnerOutcome {
  const outcome = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runnerOutcome());
  return { ...outcome, testPaths };
}

// A terminal state whose runner outcomes cover exactly the given node test paths
// (empty paths => no outcome => the run covers no node).
function stateCovering(
  base: TestRunState,
  testPaths: readonly string[],
  completedAt: string,
  startedAt: string,
): TestRunState {
  return {
    ...base,
    runnerOutcomes: testPaths.length === 0 ? [] : [outcomeCovering(testPaths)],
    completedAt,
    startedAt,
  };
}

// A terminal state with one runner outcome per path group, so a node's paths can
// be split across several outcomes that only together cover the node.
function stateCoveringAcross(
  base: TestRunState,
  outcomePaths: readonly (readonly string[])[],
  completedAt: string,
  startedAt: string,
): TestRunState {
  return {
    ...base,
    runnerOutcomes: outcomePaths.map((paths) => outcomeCovering(paths)),
    completedAt,
    startedAt,
  };
}

describe("testing last-run state storage", () => {
  it("publishes terminal state at .spx/worktree/test/runs/{run-file}.jsonl under the worktree root", async () => {
    const state = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());

    await withTestingTempProductDir(async (productDir) => {
      const created = await createTestRunFile(productDir);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.error);

      const written = await writeTerminalTestRunState(created.value.runFilePath, state);
      expect(written.ok).toBe(true);
      if (!written.ok) throw new Error(written.error);

      // Build the documented path from the storage segments directly, independent of the
      // module's own path helper, so a join bug in testingRunsDir cannot pass this assertion.
      const expectedPath = join(
        productDir,
        STATE_STORE_SCOPE_PATH.SPX_DIR,
        STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE,
        STATE_STORE_DOMAIN.TEST,
        STATE_STORE_PATH.RUNS_DIR,
        created.value.runFileName,
      );
      expect(written.value).toBe(expectedPath);

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);
      expect(runs.value.terminalRuns.map((run) => run.state)).toEqual([state]);
    });
  });

  it("refuses to overwrite an existing terminal state", async () => {
    const first = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const second = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());

    await withTestingTempProductDir(async (productDir) => {
      const created = await createTestRunFile(productDir);
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error(created.error);

      const firstWrite = await writeTerminalTestRunState(created.value.runFilePath, first);
      expect(firstWrite.ok).toBe(true);

      const secondWrite = await writeTerminalTestRunState(created.value.runFilePath, second);
      expect(secondWrite).toEqual({ ok: false, error: TESTING_RUN_STATE_ERROR.STATE_ALREADY_EXISTS });

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);
      expect(runs.value.terminalRuns.map((run) => run.state)).toEqual([first]);
    });
  });

  it("selects, for a node, the latest run covering it — a newer run that omits the node does not hide its evidence", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const nodeTestPaths = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testPaths());
    const olderCoveringRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const laterCoveringRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const newestNonCoveringRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());

    await withTestingTempProductDir(async (productDir) => {
      const olderAt = baseDate.toISOString();
      const laterAt = new Date(baseDate.getTime() + 1).toISOString();
      const newestAt = new Date(baseDate.getTime() + 2).toISOString();

      await writeTestingStateFile(
        productDir,
        olderCoveringRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, olderAt, olderAt)),
      );
      await writeTestingStateFile(
        productDir,
        laterCoveringRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, laterAt, laterAt)),
      );
      // Newest run executed no outcomes, so it does not cover the node.
      await writeTestingStateFile(
        productDir,
        newestNonCoveringRun,
        JSON.stringify(stateCovering(base, [], newestAt, newestAt)),
      );

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(laterCoveringRun);
    });
  });

  it("selects, for a node, the latest covering run — a newer run covering only other nodes does not hide its evidence", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const [nodeTestPaths, otherNodeTestPaths] = sampleTestRunStateValue(
      TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(),
    );
    const coveringRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const newerOtherNodeRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());

    await withTestingTempProductDir(async (productDir) => {
      const coveringAt = baseDate.toISOString();
      const newerAt = new Date(baseDate.getTime() + 1).toISOString();

      await writeTestingStateFile(
        productDir,
        coveringRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, coveringAt, coveringAt)),
      );
      // Newest run covers a different node's tests, so its executed set is non-empty
      // yet contains none of this node's paths.
      await writeTestingStateFile(
        productDir,
        newerOtherNodeRun,
        JSON.stringify(stateCovering(base, otherNodeTestPaths, newerAt, newerAt)),
      );

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(coveringRun);
    });
  });

  it("covers a node whose test paths span multiple runner outcomes", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const [firstOutcomePaths, secondOutcomePaths] = sampleTestRunStateValue(
      TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(),
    );
    const nodeTestPaths = [...firstOutcomePaths, ...secondOutcomePaths];
    const splitRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());

    await withTestingTempProductDir(async (productDir) => {
      const at = baseDate.toISOString();
      // Two outcomes each cover a disjoint half of the node's paths; neither alone
      // covers the node, but their union across outcomes does.
      await writeTestingStateFile(
        productDir,
        splitRun,
        JSON.stringify(stateCoveringAcross(base, [firstOutcomePaths, secondOutcomePaths], at, at)),
      );

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(splitRun);
    });
  });

  it("selects a run that covers the node plus other nodes", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const [nodeTestPaths, otherNodeTestPaths] = sampleTestRunStateValue(
      TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(),
    );
    const supersetRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());

    await withTestingTempProductDir(async (productDir) => {
      const at = baseDate.toISOString();
      // The run executes the node's paths and additional other-node paths; covering
      // a superset of the node still covers the node.
      await writeTestingStateFile(
        productDir,
        supersetRun,
        JSON.stringify(stateCovering(base, [...nodeTestPaths, ...otherNodeTestPaths], at, at)),
      );

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(supersetRun);
    });
  });

  it("selects the covering run with the greater completedAt when startedAt is shared", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const nodeTestPaths = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testPaths());
    const earlierCompletedRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const laterCompletedRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());

    await withTestingTempProductDir(async (productDir) => {
      // Both runs share startedAt; only completedAt distinguishes them, isolating
      // the primary sort key from the startedAt and file-name tie-breakers.
      const sharedStartedAt = baseDate.toISOString();
      const earlierCompletedAt = new Date(baseDate.getTime() + 1).toISOString();
      const laterCompletedAt = new Date(baseDate.getTime() + 2).toISOString();

      await writeTestingStateFile(
        productDir,
        earlierCompletedRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, earlierCompletedAt, sharedStartedAt)),
      );
      await writeTestingStateFile(
        productDir,
        laterCompletedRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, laterCompletedAt, sharedStartedAt)),
      );

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(laterCompletedRun);
    });
  });

  it("breaks a covering-run completedAt tie by the greater startedAt", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const baseDate = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate());
    const nodeTestPaths = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testPaths());
    const earlierStartedRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const laterStartedRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());

    await withTestingTempProductDir(async (productDir) => {
      const sharedCompletedAt = new Date(baseDate.getTime() + 10).toISOString();
      const earlierStartedAt = baseDate.toISOString();
      const laterStartedAt = new Date(baseDate.getTime() + 1).toISOString();

      await writeTestingStateFile(
        productDir,
        earlierStartedRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, sharedCompletedAt, earlierStartedAt)),
      );
      await writeTestingStateFile(
        productDir,
        laterStartedRun,
        JSON.stringify(stateCovering(base, nodeTestPaths, sharedCompletedAt, laterStartedAt)),
      );

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(laterStartedRun);
    });
  });

  it("breaks a covering-run completedAt and startedAt tie by lexicographic run file name", async () => {
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const nodeTestPaths = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testPaths());
    const sharedStamp = formatTestRunTimestamp(sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.timestampDate()));
    const runOne = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const runTwo = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const [, lexicographicallyLaterRun] = [runOne, runTwo].sort(compareAsciiStrings);
    const tiedState = JSON.stringify(stateCovering(base, nodeTestPaths, sharedStamp, sharedStamp));

    await withTestingTempProductDir(async (productDir) => {
      await writeTestingStateFile(productDir, runOne, tiedState);
      await writeTestingStateFile(productDir, runTwo, tiedState);

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      const selected = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, nodeTestPaths);
      expect(selected?.runFileName).toBe(lexicographicallyLaterRun);
    });
  });

  it("classifies missing, parse-invalid, and shape-invalid run files as incomplete evidence", async () => {
    const missingRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const parseInvalidRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const malformedLatestRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const shapeInvalidRun = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const missingError = Object.assign(new Error(missingRun), {
      code: TESTING_RUN_STATE_ERROR_CODE.NOT_FOUND,
    });
    const validState = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const shapeInvalidState = {
      ...validState,
      status: sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.headSha()),
    };

    await withTestingTempProductDir(async (productDir) => {
      const runs = await readTestingRuns(productDir, {
        fs: {
          readdir: async () => [
            { name: missingRun, isFile: () => true },
            { name: parseInvalidRun, isFile: () => true },
            { name: malformedLatestRun, isFile: () => true },
            { name: shapeInvalidRun, isFile: () => true },
          ],
          readFile: async (path) => {
            if (path.endsWith(missingRun)) throw missingError;
            if (path.endsWith(parseInvalidRun)) return "{";
            if (path.endsWith(malformedLatestRun)) return `${JSON.stringify(validState)}\n{\n`;
            return JSON.stringify(shapeInvalidState);
          },
        },
      });
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);

      expect(runs.value.terminalRuns).toEqual([]);
      expect(runs.value.incompleteRuns.map((run) => run.reason).sort(compareAsciiStrings)).toEqual(
        [
          TESTING_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE,
          TESTING_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE,
          TESTING_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE,
          TESTING_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
        ].sort(compareAsciiStrings),
      );
    });
  });

  it("classifies a runner outcome with an empty test path as shape-invalid evidence", async () => {
    const runFileName = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const base = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.testRunState());
    const runnerOutcome = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runnerOutcome());
    const emptyTestPath = "";
    const stateWithEmptyTestPath = {
      ...base,
      runnerOutcomes: [{ ...runnerOutcome, testPaths: [emptyTestPath] }],
    };

    await withTestingTempProductDir(async (productDir) => {
      await writeTestingStateFile(productDir, runFileName, JSON.stringify(stateWithEmptyTestPath));

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (!runs.ok) throw new Error(runs.error);
      expect(runs.value.terminalRuns).toEqual([]);
      expect(runs.value.incompleteRuns.map((run) => run.reason)).toEqual([
        TESTING_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
      ]);
    });
  });

  it("classifies a run-file read failure as IO incomplete evidence", async () => {
    const runFileName = sampleTestRunStateValue(TEST_RUN_STATE_TEST_GENERATOR.runFileName());
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const errorCode = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
    const error = Object.assign(new Error(errorCode), { code: errorCode });

    const runs = await readTestingRuns(productDir, {
      fs: createReadFailingFileSystem(runFileName, error),
    });

    expect(runs.ok).toBe(true);
    if (!runs.ok) throw new Error(runs.error);
    expect(runs.value.terminalRuns).toEqual([]);
    expect(runs.value.incompleteRuns).toEqual([
      {
        runFileName,
        runFilePath: join(testingRunsDir(productDir), runFileName),
        reason: TESTING_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
        error: errorCode,
      },
    ]);
  });
});
