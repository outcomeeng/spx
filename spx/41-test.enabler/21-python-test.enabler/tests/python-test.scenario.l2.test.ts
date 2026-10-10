import assert from "node:assert";
import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import {
  PYTEST_FIXTURE,
  registerPythonRunnerScenarioL2Evidence,
  runRealPytestOverSuites,
} from "@testing/harnesses/testing/python-runner";

registerPythonRunnerScenarioL2Evidence();

describe("python test runner path verdicts from real pytest", () => {
  it("reports failed for the failing path and passed for the passing path of one real pytest run", async () => {
    const { suitePaths, result } = await runRealPytestOverSuites([
      PYTEST_FIXTURE.FAILING_ASSERTION,
      PYTEST_FIXTURE.PASSING,
    ]);
    const [failingPath, passingPath] = suitePaths;

    expect(result.invoked).toBe(true);
    assert(result.invoked);
    expect(result.pathVerdicts).toEqual([
      { testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED },
      { testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED },
    ]);
  });
});
