import assert from "node:assert";
import { describe, expect, it } from "vitest";

import { TEST_PATH_VERDICT } from "@/test/run-state";
import {
  PYTEST_FIXTURE,
  PYTEST_INI_PLACEMENT,
  runRealPytestOverSuites,
} from "@testing/harnesses/testing/python-runner";

describe("python test runner reports verdicts when an ini-file sits nearer to the test files than the product root", () => {
  it("ALWAYS: reports each supplied path's verdict from the report rather than not-run", async () => {
    const { suitePaths, result } = await runRealPytestOverSuites(
      [PYTEST_FIXTURE.FAILING_ASSERTION, PYTEST_FIXTURE.PASSING],
      PYTEST_INI_PLACEMENT.BESIDE_SUITES,
    );
    const [failingPath, passingPath] = suitePaths;

    expect(result.invoked).toBe(true);
    assert(result.invoked);
    expect(result.pathVerdicts).toEqual([
      { testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED },
      { testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED },
    ]);
  });
});
