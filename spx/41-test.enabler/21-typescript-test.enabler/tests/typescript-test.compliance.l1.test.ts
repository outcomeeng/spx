import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import { TYPESCRIPT_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/typescript-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  runWithReportedStatuses,
  SIMULATED_EXIT_CODE,
  type SimulatedFileStatus,
  twoDistinctTestPaths,
  typescriptRunnerComplianceCases,
} from "@testing/harnesses/testing/typescript-runner";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

describe("typescript test runner derives path verdicts from the report, never the exit code", () => {
  it("maps a TypeScript path to passed from the Vitest report despite a non-zero process exit", async () => {
    await assertProperty(
      TYPESCRIPT_RUNNER_TEST_GENERATOR.nonZeroExitWithTestPath(),
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
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("maps a TypeScript path to failed from the Vitest report despite a zero process exit", async () => {
    const [failingPath] = twoDistinctTestPaths();

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

registerHarnessTestCases(typescriptRunnerComplianceCases);
