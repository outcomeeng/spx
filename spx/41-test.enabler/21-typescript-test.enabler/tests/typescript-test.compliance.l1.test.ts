import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import { TYPESCRIPT_RUNNER_TEST_GENERATOR } from "@testing/generators/testing/typescript-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import {
  runNeighbourReportScenario,
  runReportedEntriesScenario,
  SIMULATED_EXIT_CODE,
} from "@testing/harnesses/testing/simulated-report";
import {
  runWithReportedNames,
  runWithReportedStatuses,
  twoDistinctTestPaths,
  typescriptRunnerComplianceCases,
} from "@testing/harnesses/testing/typescript-runner";
import { registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

describe("typescript test runner derives path verdicts from the report, never the exit code", () => {
  it("maps a TypeScript path to passed from the Vitest report despite a non-zero process exit", async () => {
    await assertProperty(
      TYPESCRIPT_RUNNER_TEST_GENERATOR.nonZeroExitWithTestPath(),
      async ({ exitCode, testPath: passingPath }) => {
        const invocation = await runReportedEntriesScenario(runWithReportedStatuses, {
          exitCode,
          testPaths: [passingPath],
          reportedEntries: [[passingPath, TEST_PATH_VERDICT.PASSED]],
        });

        expect(invocation).toMatchObject({
          pathVerdicts: [{ testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED }],
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("maps a TypeScript path to failed from the Vitest report despite a zero process exit", async () => {
    const [failingPath] = twoDistinctTestPaths();

    const invocation = await runReportedEntriesScenario(runWithReportedStatuses, {
      exitCode: SIMULATED_EXIT_CODE.SUCCESS,
      testPaths: [failingPath],
      reportedEntries: [[failingPath, TEST_PATH_VERDICT.FAILED]],
    });

    expect(invocation).toMatchObject({
      pathVerdicts: [{ testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED }],
    });
  });
});

describe("typescript test runner takes a path verdict only from the report entry for that path", () => {
  it("reports not-run for a supplied path whose only matching report entry is a file whose path ends with it", async () => {
    await assertProperty(
      TYPESCRIPT_RUNNER_TEST_GENERATOR.neighbourReport(),
      async ({ testPath, neighbourPath, neighbourVerdict }) => {
        const invocation = await runNeighbourReportScenario(runWithReportedNames, {
          testPath,
          neighbourPath,
          neighbourVerdict,
        });

        expect(invocation).toMatchObject({
          pathVerdicts: [{ testPath, verdict: TEST_PATH_VERDICT.NOT_RUN }],
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });

  it("reports the verdict of the entry for the supplied path when a file whose path ends with it is reported first", async () => {
    await assertProperty(
      TYPESCRIPT_RUNNER_TEST_GENERATOR.neighbourReport(),
      async ({ testPath, neighbourPath, exactVerdict, neighbourVerdict }) => {
        const invocation = await runNeighbourReportScenario(runWithReportedNames, {
          testPath,
          neighbourPath,
          neighbourVerdict,
          exactVerdict,
        });

        expect(invocation).toMatchObject({
          pathVerdicts: [{ testPath, verdict: exactVerdict }],
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});

registerHarnessTestCases(typescriptRunnerComplianceCases);
