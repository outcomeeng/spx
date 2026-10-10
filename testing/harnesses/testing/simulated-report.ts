import { SUCCESS_EXIT_CODE } from "@/domains/test/aggregation";
import { TEST_PATH_VERDICT } from "@/test/run-state";

// The simulated-report vocabulary and reported-path selection both language runner harnesses
// share: each language harness renders its own report format and consumes this one selection.

/** How a recording runner's simulated invocation leaves its report. */
export const SIMULATED_REPORT = {
  /** Every supplied test file is reported with the status the exit code implies. */
  FOLLOWS_EXIT_CODE: "follows-exit-code",
  /** Only the files in `reportedStatuses` are reported; the rest are omitted. */
  LISTED_FILES: "listed-files",
  /** Exactly the files in `reportedStatuses` are reported, whether or not the invocation supplied them. */
  REPORTED_NAMES: "reported-names",
  /** No report file exists once the invocation exits. */
  MISSING: "missing",
  /** The report file holds text that is not a report of the runner's format. */
  MALFORMED: "malformed",
} as const;

/** The process exit codes a recording runner's simulated invocation returns. */
export const SIMULATED_EXIT_CODE = {
  SUCCESS: SUCCESS_EXIT_CODE,
  FAILURE: SUCCESS_EXIT_CODE + 1,
} as const;

export type SimulatedReport = (typeof SIMULATED_REPORT)[keyof typeof SIMULATED_REPORT];

export type SimulatedFileStatus = typeof TEST_PATH_VERDICT.PASSED | typeof TEST_PATH_VERDICT.FAILED;

export const SIMULATED_REPORT_ABSENT_MESSAGE = "no simulated report at";

export function simulatedReportedPaths(
  options: {
    readonly report: SimulatedReport;
    readonly reportedStatuses: ReadonlyMap<string, SimulatedFileStatus>;
  },
  testFilePaths: readonly string[],
): readonly string[] {
  if (options.report === SIMULATED_REPORT.REPORTED_NAMES) return [...options.reportedStatuses.keys()];
  if (options.report === SIMULATED_REPORT.LISTED_FILES) {
    return testFilePaths.filter((path) => options.reportedStatuses.has(path));
  }
  return testFilePaths;
}

export interface ReportedStatusesOptions {
  readonly exitCode: number;
  readonly reportedStatuses: ReadonlyMap<string, SimulatedFileStatus>;
}

/**
 * The two reported-status scenario constructions over a language harness's simulated invocation:
 * one whose report lists exactly the mapped paths among those supplied, one whose report names
 * exactly the mapped paths whether or not they were supplied.
 */
export function reportedStatusRunners<Result>(
  runWithSimulatedReport: (
    options: ReportedStatusesOptions & { readonly report: SimulatedReport },
    testPaths: readonly string[],
  ) => Result,
): {
  readonly runWithReportedStatuses: (options: ReportedStatusesOptions, testPaths: readonly string[]) => Result;
  readonly runWithReportedNames: (options: ReportedStatusesOptions, testPaths: readonly string[]) => Result;
} {
  return {
    runWithReportedStatuses: (options, testPaths) =>
      runWithSimulatedReport({ ...options, report: SIMULATED_REPORT.LISTED_FILES }, testPaths),
    runWithReportedNames: (options, testPaths) =>
      runWithSimulatedReport({ ...options, report: SIMULATED_REPORT.REPORTED_NAMES }, testPaths),
  };
}
