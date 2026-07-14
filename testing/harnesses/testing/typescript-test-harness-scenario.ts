import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { COPIED_SUITE_NAME, VITEST_FIXTURE, withTempVitestProject } from "@testing/harnesses/testing/typescript-runner";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function registerTypescriptTestHarnessScenarios(): void {
  describe("withTempVitestProject", () => {
    it("materializes the Vitest fixture suite under the OS temp root and removes the project after the callback returns", async () => {
      const tempRootPrefix = resolve(tmpdir()) + sep;
      let capturedProductDir = "";

      await withTempVitestProject(VITEST_FIXTURE.PASSING, async (productDir) => {
        capturedProductDir = productDir;

        expect(resolve(productDir).startsWith(tempRootPrefix)).toBe(true);
        expect(await readdir(productDir)).toEqual([COPIED_SUITE_NAME]);
      });

      expect(await pathExists(capturedProductDir)).toBe(false);
    });

    it("removes the Vitest project and rethrows the original error when the callback throws", async () => {
      let capturedProductDir = "";
      const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

      await expect(
        withTempVitestProject(VITEST_FIXTURE.FAILING, async (productDir) => {
          capturedProductDir = productDir;
          expect(await pathExists(productDir)).toBe(true);
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await pathExists(capturedProductDir)).toBe(false);
    });
  });
}

export const typescriptTestHarnessScenarioCases = collectHarnessTestCases(registerTypescriptTestHarnessScenarios);
