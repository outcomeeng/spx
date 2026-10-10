import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import {
  registerPythonRunnerScenarioL1Evidence,
  runWithReportedStatuses,
  runWithSimulatedReport,
} from "@testing/harnesses/testing/python-runner";
import {
  SIMULATED_EXIT_CODE,
  SIMULATED_REPORT,
  type SimulatedFileStatus,
} from "@testing/harnesses/testing/simulated-report";

describe("python test runner reports a verdict per test path from pytest's JUnit XML report", () => {
  it("reports failed for the failing path and passed for the passing path of one invocation", async () => {
    const [failingPath, passingPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

    const invocation = await runWithReportedStatuses(
      {
        exitCode: SIMULATED_EXIT_CODE.FAILURE,
        reportedStatuses: new Map<string, SimulatedFileStatus>([
          [failingPath, TEST_PATH_VERDICT.FAILED],
          [passingPath, TEST_PATH_VERDICT.PASSED],
        ]),
      },
      [failingPath, passingPath],
    );

    expect(invocation).toMatchObject({
      invoked: true,
      exitCode: SIMULATED_EXIT_CODE.FAILURE,
      pathVerdicts: [
        { testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED },
        { testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED },
      ],
    });
  });

  it("reports not-run for a supplied path the report omits", async () => {
    const [reportedPath, omittedPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

    const invocation = await runWithReportedStatuses(
      {
        exitCode: SIMULATED_EXIT_CODE.SUCCESS,
        reportedStatuses: new Map<string, SimulatedFileStatus>([[reportedPath, TEST_PATH_VERDICT.PASSED]]),
      },
      [reportedPath, omittedPath],
    );

    expect(invocation).toMatchObject({
      invoked: true,
      pathVerdicts: [
        { testPath: reportedPath, verdict: TEST_PATH_VERDICT.PASSED },
        { testPath: omittedPath, verdict: TEST_PATH_VERDICT.NOT_RUN },
      ],
    });
  });

  it.each([SIMULATED_REPORT.MISSING, SIMULATED_REPORT.MALFORMED])(
    "reports no pytest path verdicts and a non-zero exit code when the JUnit XML report is %s",
    async (report) => {
      const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

      const invocation = await runWithSimulatedReport({ exitCode: SIMULATED_EXIT_CODE.SUCCESS, report }, testPaths);

      expect(invocation.invoked).toBe(true);
      if (!invocation.invoked) return;
      expect(invocation.exitCode).not.toBe(SIMULATED_EXIT_CODE.SUCCESS);
      expect(invocation.pathVerdicts).toBeUndefined();
    },
  );
});

registerPythonRunnerScenarioL1Evidence();
