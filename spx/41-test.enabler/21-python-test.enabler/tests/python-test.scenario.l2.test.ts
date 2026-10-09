import assert from "node:assert";
import { describe, expect, it } from "vitest";

import { pythonTestingLanguage } from "@/test/languages/python";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import {
  productRootedPytestCommandRunner,
  PYTEST_FIXTURE,
  registerPythonRunnerScenarioL2Evidence,
  withTempPytestSuites,
} from "@testing/harnesses/testing/python-runner";

registerPythonRunnerScenarioL2Evidence();

describe("python test runner path verdicts from real pytest", () => {
  it("reports failed for the failing path and passed for the passing path of one invocation", async () => {
    await withTempPytestSuites(
      [PYTEST_FIXTURE.FAILING_ASSERTION, PYTEST_FIXTURE.PASSING],
      async ({ productDir, suitePaths }) => {
        const [failingPath, passingPath] = suitePaths;
        assert(failingPath !== undefined && passingPath !== undefined);

        const result = await pythonTestingLanguage.runTests(
          { productDir, testPaths: [failingPath, passingPath], excludedNodePaths: [] },
          productRootedPytestCommandRunner(productDir),
        );

        expect(result.invoked).toBe(true);
        assert(result.invoked);
        expect(result.pathVerdicts).toEqual([
          { testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED },
          { testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED },
        ]);
      },
    );
  });
});
