import * as fc from "fast-check";

import {
  type CurrentRunFacts,
  RECORDED_RUN_UNSATISFIED_REASON,
  type RecordedRunUnsatisfiedReason,
} from "@/commands/test/recorded-run";
import { NO_GIT_IDENTITY } from "@/commands/test/run-command";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import {
  extractStalenessInputs,
  type ProductInputDigest,
  type StalenessInputs,
  TEST_PATH_VERDICT,
  TEST_RUN_STATE_FIELDS,
  TEST_RUN_STATE_STATUS,
  type TestPathVerdictValue,
  type TestRunnerOutcome,
  type TestRunStateStatus,
  type TestTerminalRun,
} from "@/test/run-state";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { TEST_RUN_STATE_TEST_GENERATOR } from "@testing/generators/testing/run-state";

const SUCCESS_RUNNER_EXIT_CODE = 0;
const MIN_SELECTED_PATHS = 1;

type StalenessViolationField =
  | typeof TEST_RUN_STATE_FIELDS.TESTING_CONFIG_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_PATHS_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_CONTENT_DIGEST
  | typeof TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS;

/** The four staleness digests a recorded run must match, each violated by its own case. */
const STALENESS_VIOLATION_FIELDS: readonly StalenessViolationField[] = [
  TEST_RUN_STATE_FIELDS.TESTING_CONFIG_DIGEST,
  TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_PATHS_DIGEST,
  TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_CONTENT_DIGEST,
  TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS,
];

const UNPASSED_RUN_STATUSES: readonly TestRunStateStatus[] = Object.values(TEST_RUN_STATE_STATUS).filter((status) =>
  status !== TEST_RUN_STATE_STATUS.PASSED
);

const UNPASSED_FILE_VERDICTS: readonly TestPathVerdictValue[] = Object.values(TEST_PATH_VERDICT).filter((verdict) =>
  verdict !== TEST_PATH_VERDICT.PASSED
);

/** The one way a case violates the satisfying scenario's conditions. */
type Violation =
  | { readonly kind: "run-status"; readonly status: TestRunStateStatus }
  | { readonly kind: "file-verdict"; readonly verdict: TestPathVerdictValue }
  | { readonly kind: "run-git-identity" }
  | { readonly kind: "checkout-git-identity" }
  | { readonly kind: "head-differs" }
  | { readonly kind: "worktree-dirty" }
  | { readonly kind: "stale"; readonly field: StalenessViolationField };

export interface RecordedRunViolationCase {
  readonly label: string;
  readonly reason: RecordedRunUnsatisfiedReason;
  readonly violation: Violation;
}

/**
 * Every judged way a recorded run fails to satisfy a request, enumerated: each non-passed terminal
 * status, each non-passed file verdict, git identity unresolved on the run side and on the checkout
 * side, a differing head, a dirty worktree, and each of the four staleness digests. A run no lookup
 * finds is judged by no one.
 */
export const RECORDED_RUN_VIOLATION_CASES: readonly RecordedRunViolationCase[] = [
  ...UNPASSED_RUN_STATUSES.map((status): RecordedRunViolationCase => ({
    label: `${RECORDED_RUN_UNSATISFIED_REASON.RUN_NOT_PASSED} (${status})`,
    reason: RECORDED_RUN_UNSATISFIED_REASON.RUN_NOT_PASSED,
    violation: { kind: "run-status", status },
  })),
  ...UNPASSED_FILE_VERDICTS.map((verdict): RecordedRunViolationCase => ({
    label: `${RECORDED_RUN_UNSATISFIED_REASON.FILE_NOT_PASSED} (${verdict})`,
    reason: RECORDED_RUN_UNSATISFIED_REASON.FILE_NOT_PASSED,
    violation: { kind: "file-verdict", verdict },
  })),
  {
    label: `${RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED} (run)`,
    reason: RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED,
    violation: { kind: "run-git-identity" },
  },
  {
    label: `${RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED} (checkout)`,
    reason: RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED,
    violation: { kind: "checkout-git-identity" },
  },
  {
    label: RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS,
    reason: RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS,
    violation: { kind: "head-differs" },
  },
  {
    label: RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY,
    reason: RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY,
    violation: { kind: "worktree-dirty" },
  },
  ...STALENESS_VIOLATION_FIELDS.map((field): RecordedRunViolationCase => ({
    label: `${RECORDED_RUN_UNSATISFIED_REASON.STALE} (${field})`,
    reason: RECORDED_RUN_UNSATISFIED_REASON.STALE,
    violation: { kind: "stale", field },
  })),
];

export interface RecordedRunScenario {
  readonly run: TestTerminalRun;
  readonly selectedPaths: readonly string[];
  readonly current: CurrentRunFacts;
}

interface ViolationDraws {
  readonly scenario: RecordedRunScenario;
  readonly otherHeadSha: string;
  readonly otherDigest: string;
  readonly extraProductInput: ProductInputDigest;
}

/** A request's selected file that sits beside the node's own file and that no recorded run covers. */
export interface UncoveredRequestFiles {
  readonly file: string;
  readonly uncoveredFile: string;
}

export const RECORDED_RUN_TEST_GENERATOR = {
  satisfyingScenario: arbitrarySatisfyingScenario,
  violatedScenario: arbitraryViolatedScenario,
  uncoveredRequestFiles: arbitraryUncoveredRequestFiles,
} as const;

/** One deterministic draw from a recorded-run generator, pinned to the shared sampler's seed. */
export function sampleRecordedRunValue<T>(arbitrary: fc.Arbitrary<T>): T {
  return sampleGeneratedValue(arbitrary);
}

// A node's own test file and a second file drawn from a path set disjoint from the covered one,
// distinct from the node's file.
function arbitraryUncoveredRequestFiles(descriptor: TestingLanguageDescriptor): fc.Arbitrary<UncoveredRequestFiles> {
  return fc
    .tuple(
      TEST_DISPATCH_GENERATOR.nodeWithOwnFile(descriptor),
      TEST_RUN_STATE_TEST_GENERATOR.disjointTestPathsPair(),
    )
    .map(([{ file }, [, uncoveredPaths]]) => ({ file, uncoveredPaths }))
    .filter(({ file, uncoveredPaths }) => uncoveredPaths[0] !== file)
    .map(({ file, uncoveredPaths }) => ({ file, uncoveredFile: uncoveredPaths[0] }));
}

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

// The satisfying scenario with exactly one condition violated, the one the case names.
function arbitraryViolatedScenario(violationCase: RecordedRunViolationCase): fc.Arbitrary<RecordedRunScenario> {
  const { violation } = violationCase;
  return fc
    .record({
      scenario: arbitrarySatisfyingScenario(),
      otherHeadSha: TEST_RUN_STATE_TEST_GENERATOR.headSha(),
      otherDigest: TEST_RUN_STATE_TEST_GENERATOR.digest(),
      extraProductInput: TEST_RUN_STATE_TEST_GENERATOR.productInputDigest(),
    })
    .filter((draws) =>
      draws.otherHeadSha !== draws.scenario.current.headSha
      && (violation.kind !== "stale"
        || violation.field === TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS
        || draws.otherDigest !== draws.scenario.current.staleness[violation.field])
    )
    .map((draws) => violate(violation, draws));
}

function violate(violation: Violation, draws: ViolationDraws): RecordedRunScenario {
  const { scenario } = draws;
  switch (violation.kind) {
    case "run-status":
      return withState(scenario, { status: violation.status });
    case "file-verdict":
      return withState(scenario, {
        runnerOutcomes: scenario.run.state.runnerOutcomes.map((outcome) => ({
          ...outcome,
          pathVerdicts: outcome.pathVerdicts.map((pathVerdict) =>
            pathVerdict.testPath === scenario.selectedPaths[0]
              ? { ...pathVerdict, verdict: violation.verdict }
              : pathVerdict
          ),
        })),
      });
    case "run-git-identity":
      return withState(scenario, { headSha: NO_GIT_IDENTITY });
    case "checkout-git-identity":
      return { ...scenario, current: { ...scenario.current, headSha: null } };
    case "head-differs":
      return { ...scenario, current: { ...scenario.current, headSha: draws.otherHeadSha } };
    case "worktree-dirty":
      return { ...scenario, current: { ...scenario.current, worktreeClean: false } };
    case "stale": {
      const staleness = staleCurrentInputs(scenario.current.staleness, violation.field, draws);
      return { ...scenario, current: { ...scenario.current, staleness } };
    }
  }
}

function staleCurrentInputs(
  current: StalenessInputs,
  field: StalenessViolationField,
  draws: ViolationDraws,
): StalenessInputs {
  if (field === TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS) {
    return { ...current, productInputDigests: [...current.productInputDigests, draws.extraProductInput] };
  }
  return { ...current, [field]: draws.otherDigest };
}

function withState(
  scenario: RecordedRunScenario,
  changes: Partial<TestTerminalRun["state"]>,
): RecordedRunScenario {
  return { ...scenario, run: { ...scenario.run, state: { ...scenario.run.state, ...changes } } };
}
