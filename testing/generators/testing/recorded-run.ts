import * as fc from "fast-check";

import {
  type CurrentRunFacts,
  RECORDED_RUN_UNSATISFIED_REASON,
  type RecordedRunUnsatisfiedReason,
} from "@/commands/test/recorded-run";
import {
  extractStalenessInputs,
  type StalenessInputs,
  TEST_PATH_VERDICT,
  TEST_RUN_STATE_FIELDS,
  TEST_RUN_STATE_STATUS,
  type TestPathVerdictValue,
  type TestRunnerOutcome,
  type TestRunStateStatus,
  type TestTerminalRun,
} from "@/test/run-state";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";

const SUCCESS_RUNNER_EXIT_CODE = 0;
const MIN_SELECTED_PATHS = 1;

/** The reasons a judged run can be unsatisfied; a run no lookup finds is judged by no one. */
export const JUDGED_UNSATISFIED_REASONS: readonly RecordedRunUnsatisfiedReason[] = Object.values(
  RECORDED_RUN_UNSATISFIED_REASON,
).filter((reason) => reason !== RECORDED_RUN_UNSATISFIED_REASON.NO_COVERING_RUN);

type MutableStalenessDigestField =
  | typeof TEST_RUN_STATE_FIELDS.TESTING_CONFIG_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_PATHS_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_CONTENT_DIGEST;

export interface RecordedRunScenario {
  readonly run: TestTerminalRun;
  readonly selectedPaths: readonly string[];
  readonly current: CurrentRunFacts;
}

interface ViolationDraws {
  readonly scenario: RecordedRunScenario;
  readonly otherHeadSha: string;
  readonly otherDigest: string;
  readonly digestField: MutableStalenessDigestField;
  readonly unpassedStatus: TestRunStateStatus;
  readonly unpassedVerdict: TestPathVerdictValue;
}

export const RECORDED_RUN_TEST_GENERATOR = {
  satisfyingScenario: arbitrarySatisfyingScenario,
  violatedScenario: arbitraryViolatedScenario,
} as const;

// A passed run whose single outcome records `passed` for every path it covers, a request that
// selects a non-empty subset of those paths, and current facts equal to the run's own record.
function arbitrarySatisfyingScenario(): fc.Arbitrary<RecordedRunScenario> {
  return fc
    .tuple(
      TEST_RUN_STATE_TEST_GENERATOR.testRunState(),
      TEST_RUN_STATE_TEST_GENERATOR.testPaths(),
      TEST_RUN_STATE_TEST_GENERATOR.runFileName(),
    )
    .chain(([base, coveredPaths, runFileName]) =>
      fc
        .subarray([...coveredPaths], { minLength: MIN_SELECTED_PATHS })
        .map((selectedPaths): RecordedRunScenario => {
          const outcome: TestRunnerOutcome = {
            runnerId: base.branchName,
            testPaths: coveredPaths,
            exitCode: SUCCESS_RUNNER_EXIT_CODE,
            pathVerdicts: coveredPaths.map((testPath) => ({ testPath, verdict: TEST_PATH_VERDICT.PASSED })),
          };
          const state = { ...base, status: TEST_RUN_STATE_STATUS.PASSED, runnerOutcomes: [outcome] };
          return {
            run: { runFileName, runFilePath: runFileName, state },
            selectedPaths,
            current: {
              headSha: state.headSha,
              worktreeClean: true,
              staleness: extractStalenessInputs(state),
            },
          };
        })
    );
}

// The satisfying scenario with exactly one condition violated, the one the reason names.
function arbitraryViolatedScenario(reason: RecordedRunUnsatisfiedReason): fc.Arbitrary<RecordedRunScenario> {
  return fc
    .record({
      scenario: arbitrarySatisfyingScenario(),
      otherHeadSha: TEST_RUN_STATE_TEST_GENERATOR.headSha(),
      otherDigest: TEST_RUN_STATE_TEST_GENERATOR.digest(),
      digestField: TEST_RUN_STATE_TEST_GENERATOR.mutableStalenessDigestField(),
      unpassedStatus: fc.constantFrom(TEST_RUN_STATE_STATUS.FAILED, TEST_RUN_STATE_STATUS.INTERRUPTED),
      unpassedVerdict: fc.constantFrom(TEST_PATH_VERDICT.FAILED, TEST_PATH_VERDICT.NOT_RUN),
    })
    .filter((draws) =>
      draws.otherHeadSha !== draws.scenario.current.headSha
      && draws.otherDigest !== draws.scenario.current.staleness[draws.digestField]
    )
    .map((draws) => violate(reason, draws));
}

function violate(reason: RecordedRunUnsatisfiedReason, draws: ViolationDraws): RecordedRunScenario {
  const { scenario } = draws;
  switch (reason) {
    case RECORDED_RUN_UNSATISFIED_REASON.RUN_NOT_PASSED:
      return withState(scenario, { status: draws.unpassedStatus });
    case RECORDED_RUN_UNSATISFIED_REASON.FILE_NOT_PASSED:
      return withState(scenario, {
        runnerOutcomes: scenario.run.state.runnerOutcomes.map((outcome) => ({
          ...outcome,
          pathVerdicts: outcome.pathVerdicts.map((pathVerdict) =>
            pathVerdict.testPath === scenario.selectedPaths[0]
              ? { ...pathVerdict, verdict: draws.unpassedVerdict }
              : pathVerdict
          ),
        })),
      });
    case RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED:
      return { ...scenario, current: { ...scenario.current, headSha: null } };
    case RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS:
      return { ...scenario, current: { ...scenario.current, headSha: draws.otherHeadSha } };
    case RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY:
      return { ...scenario, current: { ...scenario.current, worktreeClean: false } };
    case RECORDED_RUN_UNSATISFIED_REASON.STALE: {
      const staleness: StalenessInputs = { ...scenario.current.staleness, [draws.digestField]: draws.otherDigest };
      return { ...scenario, current: { ...scenario.current, staleness } };
    }
    default:
      return scenario;
  }
}

function withState(
  scenario: RecordedRunScenario,
  changes: Partial<TestTerminalRun["state"]>,
): RecordedRunScenario {
  return { ...scenario, run: { ...scenario.run, state: { ...scenario.run.state, ...changes } } };
}
