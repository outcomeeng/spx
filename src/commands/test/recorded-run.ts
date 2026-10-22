import { getHeadSha, isWorkingTreeClean } from "@/lib/git/root";
import {
  extractStalenessInputs,
  isStalenessMatch,
  readTestingRuns,
  selectLatestTerminalTestRunForNode,
  type StalenessInputs,
  TEST_PATH_VERDICT,
  TEST_RUN_STATE_STATUS,
  type TestTerminalRun,
} from "@/test/run-state";

import { currentStalenessInputs, NO_GIT_IDENTITY, type TestCommandDependencies } from "./run-command";

/** The closed set of reasons a recorded run fails to satisfy a request. */
export const RECORDED_RUN_UNSATISFIED_REASON = {
  NO_COVERING_RUN: "no-covering-run",
  RUN_NOT_PASSED: "run-not-passed",
  FILE_NOT_PASSED: "file-not-passed",
  GIT_IDENTITY_UNRESOLVED: "git-identity-unresolved",
  HEAD_DIFFERS: "head-differs",
  WORKTREE_DIRTY: "worktree-dirty",
  STALE: "stale",
} as const;

export type RecordedRunUnsatisfiedReason =
  (typeof RECORDED_RUN_UNSATISFIED_REASON)[keyof typeof RECORDED_RUN_UNSATISFIED_REASON];

export type RecordedRunJudgement =
  | { readonly satisfied: true }
  | { readonly satisfied: false; readonly reason: RecordedRunUnsatisfiedReason };

export type RecordedRunLookup =
  | { readonly satisfied: true; readonly run: TestTerminalRun }
  | { readonly satisfied: false; readonly reason: RecordedRunUnsatisfiedReason };

/** The current checkout facts a recorded run is compared against. */
export interface CurrentRunFacts {
  /** The current head commit, or null when git identity does not resolve. */
  readonly headSha: string | null;
  /** True when no git-visible file differs from the head commit. */
  readonly worktreeClean: boolean;
  /** The four staleness inputs derived over the run's own covered set. */
  readonly staleness: StalenessInputs;
}

export interface RecordedRunRequest {
  readonly productDir: string;
  /** The test files the request selects, as product-relative POSIX paths. */
  readonly selectedPaths: readonly string[];
}

/**
 * Judges whether one recorded run satisfies a request: its terminal status is
 * `passed`, the recorded verdict of every selected file is `passed`, git identity
 * resolves for both the record and the checkout, the head commits are equal, the
 * worktree holds no git-visible change, and all four staleness digests equal the
 * current values.
 */
export function judgeRecordedRun(
  run: TestTerminalRun,
  selectedPaths: readonly string[],
  current: CurrentRunFacts,
): RecordedRunJudgement {
  const { state } = run;
  if (state.status !== TEST_RUN_STATE_STATUS.PASSED) return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.RUN_NOT_PASSED);
  if (!everySelectedFilePassed(run, selectedPaths)) {
    return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.FILE_NOT_PASSED);
  }
  if (current.headSha === null || state.headSha === NO_GIT_IDENTITY) {
    return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED);
  }
  if (state.headSha !== current.headSha) return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS);
  if (!current.worktreeClean) return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY);
  if (!isStalenessMatch(extractStalenessInputs(state), current.staleness)) {
    return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.STALE);
  }
  return { satisfied: true };
}

/**
 * Finds the recorded run that satisfies a request. Only the latest terminal run
 * covering every selected file is considered, so an older passed run never stands
 * in for a later failed or stale run over the same files. The lookup reads run
 * files and git state and adds, rewrites, and removes none.
 */
export async function findSatisfyingRecordedRun(
  request: RecordedRunRequest,
  deps: TestCommandDependencies,
): Promise<RecordedRunLookup> {
  const runs = await readTestingRuns(request.productDir, { fs: deps.fs });
  if (!runs.ok) return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.NO_COVERING_RUN);
  const candidate = selectLatestTerminalTestRunForNode(runs.value.terminalRuns, request.selectedPaths);
  if (candidate === undefined) return unsatisfied(RECORDED_RUN_UNSATISFIED_REASON.NO_COVERING_RUN);

  const coveredPaths = candidate.state.runnerOutcomes.flatMap((outcome) => outcome.testPaths);
  const current: CurrentRunFacts = {
    headSha: await getHeadSha(request.productDir, deps.git),
    worktreeClean: await isWorkingTreeClean(request.productDir, deps.git),
    staleness: await currentStalenessInputs(request.productDir, coveredPaths, {
      fs: deps.fs,
      registry: deps.registry,
    }),
  };
  const judgement = judgeRecordedRun(candidate, request.selectedPaths, current);
  return judgement.satisfied ? { satisfied: true, run: candidate } : judgement;
}

function everySelectedFilePassed(run: TestTerminalRun, selectedPaths: readonly string[]): boolean {
  const verdicts = new Map(
    run.state.runnerOutcomes
      .flatMap((outcome) => outcome.pathVerdicts)
      .map((pathVerdict) => [pathVerdict.testPath, pathVerdict.verdict]),
  );
  return selectedPaths.every((path) => verdicts.get(path) === TEST_PATH_VERDICT.PASSED);
}

function unsatisfied(
  reason: RecordedRunUnsatisfiedReason,
): { readonly satisfied: false; readonly reason: RecordedRunUnsatisfiedReason } {
  return { satisfied: false, reason };
}
