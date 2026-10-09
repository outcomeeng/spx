import assert from "node:assert";
import { describe, expect, it } from "vitest";

import { pythonTestingLanguage } from "@/test/languages/python";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import {
  productRootedPytestCommandRunner,
  PYTEST_FIXTURE,
  withTempPytestSuitesUnderNearerIni,
} from "@testing/harnesses/testing/python-runner";

describe("python test runner reports verdicts when an ini-file sits nearer to the test files than the product root", () => {
  it("ALWAYS: reports each supplied path's verdict from the report rather than not-run", async () => {
    await withTempPytestSuitesUnderNearerIni(
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
