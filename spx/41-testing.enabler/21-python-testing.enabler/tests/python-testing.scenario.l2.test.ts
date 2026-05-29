import { describe, expect, it } from "vitest";

import { pythonTestingLanguage } from "@/testing/languages/python";
import {
  PYTEST_FIXTURE,
  repoRootedPytestCommandRunner,
  withTempPytestProject,
} from "@testing/harnesses/testing/python-runner";

describe("python test runner drives real pytest", () => {
  it("invokes pytest against a passing project and exits zero", async () => {
    await withTempPytestProject(PYTEST_FIXTURE.PASSING, async (projectRoot) => {
      const result = await pythonTestingLanguage.runTests(
        { projectRoot, testPaths: [], excludedNodePaths: [] },
        repoRootedPytestCommandRunner(projectRoot),
      );

      expect(result.invoked).toBe(true);
      expect(result.exitCode).toBe(0);
    });
  });

  it("invokes pytest against a project with a missing import and exits non-zero", async () => {
    await withTempPytestProject(PYTEST_FIXTURE.FAILING, async (projectRoot) => {
      const result = await pythonTestingLanguage.runTests(
        { projectRoot, testPaths: [], excludedNodePaths: [] },
        repoRootedPytestCommandRunner(projectRoot),
      );

      expect(result.invoked).toBe(true);
      expect(result.exitCode).not.toBe(0);
    });
  });
});
