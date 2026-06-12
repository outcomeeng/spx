import { describe, expect, it } from "vitest";

import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import {
  repoRootedCommandRunner,
  VITEST_FIXTURE,
  withTempVitestProject,
} from "@testing/harnesses/testing/typescript-runner";

describe("typescript test runner drives real vitest", () => {
  it("invokes vitest against a passing project and exits zero", async () => {
    await withTempVitestProject(VITEST_FIXTURE.PASSING, async (projectRoot) => {
      const result = await typescriptTestingLanguage.runTests(
        { projectRoot, testPaths: [], excludedNodePaths: [] },
        repoRootedCommandRunner(),
      );

      expect(result.invoked).toBe(true);
      if (!result.invoked) throw new Error();
      expect(result.exitCode).toBe(0);
    });
  });

  it("invokes vitest against a failing project and exits non-zero", async () => {
    await withTempVitestProject(VITEST_FIXTURE.FAILING, async (projectRoot) => {
      const result = await typescriptTestingLanguage.runTests(
        { projectRoot, testPaths: [], excludedNodePaths: [] },
        repoRootedCommandRunner(),
      );

      expect(result.invoked).toBe(true);
      if (!result.invoked) throw new Error();
      expect(result.exitCode).not.toBe(0);
    });
  });
});
