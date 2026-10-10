import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  registerPythonRunnerComplianceEvidence,
  runWithReportedNames,
  runWithReportedStatuses,
  SIMULATED_EXIT_CODE,
  type SimulatedFileStatus,
} from "@testing/harnesses/testing/python-runner";

describe("python test runner derives path verdicts from the report, never the exit code", () => {
  it("reports a path passed when the report passes it though the process exits non-zero", async () => {
    await assertProperty(
      PYTHON_RUNNER_TEST_GENERATOR.nonZeroExitWithTestPath(),
      async ({ exitCode, testPath: passingPath }) => {
        const invocation = await runWithReportedStatuses(
          {
            exitCode,
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

    const invocation = await runWithReportedStatuses(
      {
        exitCode: SIMULATED_EXIT_CODE.SUCCESS,
        reportedStatuses: new Map<string, SimulatedFileStatus>([[failingPath, TEST_PATH_VERDICT.FAILED]]),
      },
      [failingPath],
    );

    expect(invocation).toMatchObject({
      pathVerdicts: [{ testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED }],
    });
  });
});

describe("python test runner takes a path verdict only from the report testcases of that path's module", () => {
  it("reports not-run for a supplied path whose only matching testcases belong to a module that ends with its module", async () => {
    await assertProperty(
      PYTHON_RUNNER_TEST_GENERATOR.neighbourReport(),
      async ({ testPath, neighbourPath, neighbourVerdict }) => {
        const invocation = await runWithReportedNames(
          {
            exitCode: SIMULATED_EXIT_CODE.SUCCESS,
            reportedStatuses: new Map<string, SimulatedFileStatus>([[neighbourPath, neighbourVerdict]]),
          },
          [testPath],
        );

        expect(invocation).toMatchObject({
          pathVerdicts: [{ testPath, verdict: TEST_PATH_VERDICT.NOT_RUN }],
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("reports the verdict of the supplied path's own module when a module that ends with it is reported first", async () => {
    await assertProperty(
      PYTHON_RUNNER_TEST_GENERATOR.neighbourReport(),
      async ({ testPath, neighbourPath, exactVerdict, neighbourVerdict }) => {
        const invocation = await runWithReportedNames(
          {
            exitCode: SIMULATED_EXIT_CODE.SUCCESS,
            reportedStatuses: new Map<string, SimulatedFileStatus>([
              [neighbourPath, neighbourVerdict],
              [testPath, exactVerdict],
            ]),
          },
          [testPath],
        );

        expect(invocation).toMatchObject({
          pathVerdicts: [{ testPath, verdict: exactVerdict }],
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

registerPythonRunnerComplianceEvidence();
