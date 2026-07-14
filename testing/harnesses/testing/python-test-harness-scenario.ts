import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { PYTEST_FIXTURE, withTempPytestProject } from "@testing/harnesses/testing/python-runner";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function registerPythonTestHarnessScenarios(): void {
  describe("withTempPytestProject", () => {
    it("materializes the fixture suite under the OS temp root and removes the project after the callback returns", async () => {
      const tempRootPrefix = resolve(tmpdir()) + sep;
      let capturedProductDir = "";
      let capturedSuitePath = "";

      await withTempPytestProject(PYTEST_FIXTURE.PASSING, async ({ productDir, suitePath }) => {
        capturedProductDir = productDir;
        capturedSuitePath = suitePath;

        expect(resolve(productDir).startsWith(tempRootPrefix)).toBe(true);
        expect(suitePath.startsWith(productDir)).toBe(true);
        expect(await pathExists(suitePath)).toBe(true);
      });

      expect(await pathExists(capturedProductDir)).toBe(false);
      expect(await pathExists(capturedSuitePath)).toBe(false);
    });

    it("removes the project and rethrows the original error when the callback throws", async () => {
      let capturedProductDir = "";
      const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

      await expect(
        withTempPytestProject(PYTEST_FIXTURE.FAILING, async ({ productDir }) => {
          capturedProductDir = productDir;
          expect(await pathExists(productDir)).toBe(true);
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await pathExists(capturedProductDir)).toBe(false);
    });
  });
}

export const pythonTestHarnessScenarioCases = collectHarnessTestCases(registerPythonTestHarnessScenarios);
