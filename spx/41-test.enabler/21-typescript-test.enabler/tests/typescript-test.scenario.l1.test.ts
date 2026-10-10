import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import {
  runReportedEntriesScenario,
  SIMULATED_EXIT_CODE,
  SIMULATED_REPORT,
} from "@testing/harnesses/testing/simulated-report";
import {
  runWithReportedStatuses,
  runWithSimulatedReport,
  twoDistinctTestPaths,
  typescriptRunnerScenarioL1Cases,
} from "@testing/harnesses/testing/typescript-runner";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

describe("typescript test runner reports a verdict per test path from Vitest's JSON report", () => {
  it("maps the failing TypeScript path to failed and the passing TypeScript path to passed within one invocation", async () => {
    const [failingPath, passingPath] = twoDistinctTestPaths();

    const invocation = await runReportedEntriesScenario(runWithReportedStatuses, {
      exitCode: SIMULATED_EXIT_CODE.FAILURE,
      testPaths: [failingPath, passingPath],
      reportedEntries: [[failingPath, TEST_PATH_VERDICT.FAILED], [passingPath, TEST_PATH_VERDICT.PASSED]],
    });

    expect(invocation).toMatchObject({
      invoked: true,
      exitCode: SIMULATED_EXIT_CODE.FAILURE,
      pathVerdicts: [
        { testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED },
        { testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED },
      ],
    });
  });

  it("maps a supplied TypeScript path absent from the Vitest report to not-run", async () => {
    const [reportedPath, omittedPath] = twoDistinctTestPaths();

    const invocation = await runReportedEntriesScenario(runWithReportedStatuses, {
      exitCode: SIMULATED_EXIT_CODE.SUCCESS,
      testPaths: [reportedPath, omittedPath],
      reportedEntries: [[reportedPath, TEST_PATH_VERDICT.PASSED]],
    });

    expect(invocation).toMatchObject({
      invoked: true,
      pathVerdicts: [
        { testPath: reportedPath, verdict: TEST_PATH_VERDICT.PASSED },
        { testPath: omittedPath, verdict: TEST_PATH_VERDICT.NOT_RUN },
      ],
    });
  });

  it.each([SIMULATED_REPORT.MISSING, SIMULATED_REPORT.MALFORMED])(
    "carries no path verdicts and a non-zero exit code when the report is %s",
    async (report) => {
      const testPaths = twoDistinctTestPaths();

      const invocation = await runWithSimulatedReport({ exitCode: SIMULATED_EXIT_CODE.SUCCESS, report }, testPaths);

      expect(invocation.invoked).toBe(true);
      if (!invocation.invoked) return;
      expect(invocation.exitCode).not.toBe(SIMULATED_EXIT_CODE.SUCCESS);
      expect(invocation.pathVerdicts).toBeUndefined();
    },
  );
});

registerHarnessTestCases(typescriptRunnerScenarioL1Cases);
