import { executionRecordingScenarioCases } from "@testing/harnesses/testing/execution-recording-scenarios";
import { describe, expect, it, registerHarnessTestCases } from "@testing/harnesses/vitest-registration";

import { runTestsCommand } from "@/commands/test";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { readTestingRuns, TEST_PATH_VERDICT } from "@/test/run-state";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { testingCommandDependencies } from "@testing/harnesses/testing/command-support";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import {
  createRecordingCommandRunner,
  SIMULATED_REPORT,
  type SimulatedFileStatus,
} from "@testing/harnesses/testing/typescript-runner";

registerHarnessTestCases(executionRecordingScenarioCases);

describe("per-file verdicts in the recorded run", () => {
  it("records failed for the failing test file and passed for the passing test file of one run", async () => {
    const [failingNode, passingNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const failingFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, failingNode),
    );
    const passingFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, passingNode),
    );
    const runner = createRecordingCommandRunner({
      present: true,
      exitCode: 1,
      report: SIMULATED_REPORT.LISTED_FILES,
      reportedStatuses: new Map<string, SimulatedFileStatus>([
        [failingFile, TEST_PATH_VERDICT.FAILED],
        [passingFile, TEST_PATH_VERDICT.PASSED],
      ]),
    });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, failingFile);
      await writeTestFileFixture(productDir, passingFile);

      await runTestsCommand({ productDir, passing: false }, testingCommandDependencies(runner));

      const runs = await readTestingRuns(productDir);
      expect(runs.ok).toBe(true);
      if (runs.ok) {
        expect(runs.value.terminalRuns).toHaveLength(1);
        const pathVerdicts = runs.value.terminalRuns.flatMap((run) =>
          run.state.runnerOutcomes.flatMap((outcome) => outcome.pathVerdicts)
        );
        expect(pathVerdicts).toHaveLength(2);
        expect(pathVerdicts).toContainEqual({ testPath: failingFile, verdict: TEST_PATH_VERDICT.FAILED });
        expect(pathVerdicts).toContainEqual({ testPath: passingFile, verdict: TEST_PATH_VERDICT.PASSED });
      }
    });
  });
});
