import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { COPIED_SUITE_NAME, VITEST_FIXTURE, withTempVitestProject } from "@testing/harnesses/testing/typescript-runner";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("withTempVitestProject", () => {
  it("materializes the Vitest fixture suite under the OS temp root and removes the project after the callback returns", async () => {
    const tempRootPrefix = resolve(tmpdir()) + sep;
    let capturedProjectRoot = "";

    await withTempVitestProject(VITEST_FIXTURE.PASSING, async (projectRoot) => {
      capturedProjectRoot = projectRoot;

      expect(resolve(projectRoot).startsWith(tempRootPrefix)).toBe(true);
      expect(await readdir(projectRoot)).toEqual([COPIED_SUITE_NAME]);
    });

    expect(await pathExists(capturedProjectRoot)).toBe(false);
  });

  it("removes the Vitest project and rethrows the original error when the callback throws", async () => {
    let capturedProjectRoot = "";
    const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

    await expect(
      withTempVitestProject(VITEST_FIXTURE.FAILING, async (projectRoot) => {
        capturedProjectRoot = projectRoot;
        expect(await pathExists(projectRoot)).toBe(true);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await pathExists(capturedProjectRoot)).toBe(false);
  });
});
