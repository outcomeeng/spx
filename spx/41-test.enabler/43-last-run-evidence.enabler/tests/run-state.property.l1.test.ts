import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createTestRunFile,
  formatTestRunTimestamp,
  readTestingRuns,
  selectLatestTerminalTestRunForNode,
  type TestRunnerOutcome,
  type TestRunState,
  type TestTerminalRun,
  writeTerminalTestRunState,
} from "@/test/run-state";
import { LITERAL_TEST_GENERATOR_COUNTS } from "@testing/generators/literal/literal";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";

interface TerminalRunPool {
  readonly nodeTestPaths: readonly string[];
  readonly expectedRunFileName: string;
  readonly runs: readonly TestTerminalRun[];
}

function arbitraryTerminalRunPool(): fc.Arbitrary<TerminalRunPool> {
  return TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair()
    .chain(([nodeTestPaths, otherTestPaths]) =>
      fc.tuple(
        fc.uniqueArray(TEST_RUN_STATE_TEST_GENERATOR.runFileName(), {
          minLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
          maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
          selector: (runFileName) => runFileName,
        }),
        fc.array(TEST_RUN_STATE_TEST_GENERATOR.testRunState(), {
          minLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
          maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
        }),
        fc.array(TEST_RUN_STATE_TEST_GENERATOR.runnerOutcome(), {
          minLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
          maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
        }),
        TEST_RUN_STATE_TEST_GENERATOR.timestampDate(),
      )
        .chain(([runFileNames, states, outcomes, baseDate]) => {
          const [
            fileNameTieLoser,
            fileNameTieWinner,
            nonCoveringRunFileName,
            completedAtLoserRunFileName,
            startedAtLoserRunFileName,
          ] = [...runFileNames].sort(compareStrings);
          const [
            completedAtLoserState,
            startedAtLoserState,
            fileNameTieLoserState,
            fileNameTieWinnerState,
            nonCoveringState,
          ] = states;
          const [
            completedAtLoserOutcome,
            startedAtLoserOutcome,
            fileNameTieLoserOutcome,
            fileNameTieWinnerOutcome,
            nonCoveringOutcome,
          ] = outcomes;
          if (
            fileNameTieLoser === undefined
            || fileNameTieWinner === undefined
            || nonCoveringRunFileName === undefined
            || completedAtLoserRunFileName === undefined
            || startedAtLoserRunFileName === undefined
            || completedAtLoserState === undefined
            || startedAtLoserState === undefined
            || fileNameTieLoserState === undefined
            || fileNameTieWinnerState === undefined
            || nonCoveringState === undefined
            || completedAtLoserOutcome === undefined
            || startedAtLoserOutcome === undefined
            || fileNameTieLoserOutcome === undefined
            || fileNameTieWinnerOutcome === undefined
            || nonCoveringOutcome === undefined
          ) {
            throw new Error("terminal run pool generator returned too few values");
          }

          const startedFirst = formatTestRunTimestamp(baseDate);
          const startedSharedByTie = formatTestRunTimestamp(new Date(baseDate.getTime() + 1));
          const completedBeforeTie = formatTestRunTimestamp(new Date(baseDate.getTime() + 2));
          const completedSharedByTie = formatTestRunTimestamp(new Date(baseDate.getTime() + 3));
          const nonCoveringLatest = formatTestRunTimestamp(new Date(baseDate.getTime() + 4));

          const runs = [
            terminalRunCovering(
              completedAtLoserRunFileName,
              completedAtLoserState,
              completedAtLoserOutcome,
              nodeTestPaths,
              completedBeforeTie,
              completedBeforeTie,
            ),
            terminalRunCovering(
              startedAtLoserRunFileName,
              startedAtLoserState,
              startedAtLoserOutcome,
              nodeTestPaths,
              completedSharedByTie,
              startedFirst,
            ),
            terminalRunCovering(
              fileNameTieLoser,
              fileNameTieLoserState,
              fileNameTieLoserOutcome,
              nodeTestPaths,
              completedSharedByTie,
              startedSharedByTie,
            ),
            terminalRunCovering(
              fileNameTieWinner,
              fileNameTieWinnerState,
              fileNameTieWinnerOutcome,
              nodeTestPaths,
              completedSharedByTie,
              startedSharedByTie,
            ),
            terminalRunCovering(
              nonCoveringRunFileName,
              nonCoveringState,
              nonCoveringOutcome,
              otherTestPaths,
              nonCoveringLatest,
              nonCoveringLatest,
            ),
          ];
          return fc.shuffledSubarray(runs, {
            minLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
            maxLength: LITERAL_TEST_GENERATOR_COUNTS.findingsMax,
          }).map((shuffledRuns) => ({
            nodeTestPaths,
            expectedRunFileName: fileNameTieWinner,
            runs: shuffledRuns,
          }));
        })
    );
}

function terminalRunCovering(
  runFileName: string,
  state: TestRunState,
  outcome: TestRunnerOutcome,
  testPaths: readonly string[],
  completedAt: string,
  startedAt: string,
): TestTerminalRun {
  return {
    runFileName,
    runFilePath: runFileName,
    state: {
      ...state,
      runnerOutcomes: [{ ...outcome, testPaths }],
      completedAt,
      startedAt,
    },
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

describe("testing last-run state record fidelity", () => {
  it("round-trips every recorded field through write and read", async () => {
    await withTestingTempProductDir(async (productDir) => {
      await fc.assert(
        fc.asyncProperty(TEST_RUN_STATE_TEST_GENERATOR.testRunState(), async (state) => {
          const created = await createTestRunFile(productDir);
          if (!created.ok) throw new Error(created.error);

          const written = await writeTerminalTestRunState(created.value.runFilePath, state);
          if (!written.ok) throw new Error(written.error);

          const runs = await readTestingRuns(productDir);
          if (!runs.ok) throw new Error(runs.error);

          const persisted = runs.value.terminalRuns.find(
            (run) => run.runFileName === created.value.runFileName,
          );
          expect(persisted?.state).toEqual(state);
        }),
        { numRuns: 25 },
      );
    });
  });

  it("selects the latest covering run by completed time, started time, and run file name", () => {
    fc.assert(
      fc.property(arbitraryTerminalRunPool(), ({ nodeTestPaths, expectedRunFileName, runs }) => {
        expect(selectLatestTerminalTestRunForNode(runs, nodeTestPaths)?.runFileName).toBe(expectedRunFileName);
      }),
      { numRuns: LITERAL_TEST_GENERATOR_COUNTS.smallPropertyRuns },
    );
  });
});
