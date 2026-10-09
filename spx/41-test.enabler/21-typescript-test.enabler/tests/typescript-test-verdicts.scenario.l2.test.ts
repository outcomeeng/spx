import assert from "node:assert";
import { describe, expect, it } from "vitest";

import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import {
  productRootedCommandRunner,
  VITEST_FIXTURE,
  withTempVitestSuites,
} from "@testing/harnesses/testing/typescript-runner";

describe("typescript test runner path verdicts from real vitest", () => {
  it("maps the failing file to failed and the passing file to passed from one real vitest JSON report", async () => {
    await withTempVitestSuites(
      [VITEST_FIXTURE.FAILING, VITEST_FIXTURE.PASSING],
      async ({ productDir, suitePaths }) => {
        const [failingPath, passingPath] = suitePaths;
        assert(failingPath !== undefined && passingPath !== undefined);

        const result = await typescriptTestingLanguage.runTests(
          { productDir, testPaths: [failingPath, passingPath], excludedNodePaths: [] },
          productRootedCommandRunner(),
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
