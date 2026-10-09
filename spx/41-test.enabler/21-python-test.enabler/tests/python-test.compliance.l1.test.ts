import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  registerPythonRunnerComplianceEvidence,
  runWithSimulatedReport,
  SIMULATED_REPORT,
  type SimulatedFileStatus,
} from "@testing/harnesses/testing/python-runner";

describe("python test runner derives path verdicts from the report, never the exit code", () => {
  it("reports a path passed when the report passes it though the process exits non-zero", async () => {
    await assertProperty(
      PYTHON_RUNNER_TEST_GENERATOR.nonZeroExitCode(),
      async (exitCode) => {
        const [passingPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

        const invocation = await runWithSimulatedReport(
          {
            exitCode,
            report: SIMULATED_REPORT.LISTED_FILES,
            reportedStatuses: new Map<string, SimulatedFileStatus>([[passingPath, TEST_PATH_VERDICT.PASSED]]),
          },
          [passingPath],
        );

        expect(invocation).toMatchObject({
          pathVerdicts: [{ testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED }],
        });
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("reports a path failed when the report fails it though the process exits zero", async () => {
    const [failingPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

    const invocation = await runWithSimulatedReport(
      {
        exitCode: 0,
        report: SIMULATED_REPORT.LISTED_FILES,
        reportedStatuses: new Map<string, SimulatedFileStatus>([[failingPath, TEST_PATH_VERDICT.FAILED]]),
      },
      [failingPath],
    );

    expect(invocation).toMatchObject({
      pathVerdicts: [{ testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED }],
    });
  });
});

registerPythonRunnerComplianceEvidence();
