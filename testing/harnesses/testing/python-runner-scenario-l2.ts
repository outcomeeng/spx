import { pythonTestingLanguage } from "@/test/languages/python";
import {
  PYTEST_EXIT_CODE,
  PYTEST_FIXTURE,
  repoRootedPytestCommandRunner,
  withTempPytestProject,
} from "@testing/harnesses/testing/python-runner";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

export function registerPythonRunnerScenarioL2(): void {
  describe("python test runner drives real pytest", () => {
    it("invokes pytest against a passing project and exits zero", async () => {
      await withTempPytestProject(PYTEST_FIXTURE.PASSING, async ({ productDir, suitePath }) => {
        const result = await pythonTestingLanguage.runTests(
          { productDir, testPaths: [suitePath], excludedNodePaths: [] },
          repoRootedPytestCommandRunner(productDir),
        );

        expect(result.invoked).toBe(true);
        if (result.invoked) expect(result.exitCode).toBe(0);
      });
    });

    it("invokes pytest against a project with a missing import and exits non-zero", async () => {
      await withTempPytestProject(PYTEST_FIXTURE.FAILING, async ({ productDir, suitePath }) => {
        const result = await pythonTestingLanguage.runTests(
          { productDir, testPaths: [suitePath], excludedNodePaths: [] },
          repoRootedPytestCommandRunner(productDir),
        );

        expect(result.invoked).toBe(true);
        if (result.invoked) {
          expect(result.exitCode).not.toBe(0);
          expect(result.exitCode).not.toBe(PYTEST_EXIT_CODE.NO_TESTS_COLLECTED);
        }
      });
    });
  });
}

export const pythonRunnerScenarioL2Cases = collectHarnessTestCases(registerPythonRunnerScenarioL2);
