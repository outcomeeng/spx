import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { PYTEST_FIXTURE, withTempPytestProject } from "@testing/harnesses/testing/python-runner";

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("withTempPytestProject", () => {
  it("materializes the fixture suite under the OS temp root and removes the project after the callback returns", async () => {
    const tempRootPrefix = resolve(tmpdir()) + sep;
    let capturedProjectRoot = "";
    let capturedSuitePath = "";

    await withTempPytestProject(PYTEST_FIXTURE.PASSING, async ({ projectRoot, suitePath }) => {
      capturedProjectRoot = projectRoot;
      capturedSuitePath = suitePath;

      expect(resolve(projectRoot).startsWith(tempRootPrefix)).toBe(true);
      expect(suitePath.startsWith(projectRoot)).toBe(true);
      expect(await pathExists(suitePath)).toBe(true);
    });

    expect(await pathExists(capturedProjectRoot)).toBe(false);
    expect(await pathExists(capturedSuitePath)).toBe(false);
  });

  it("removes the project and rethrows the original error when the callback throws", async () => {
    let capturedProjectRoot = "";
    const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

    await expect(
      withTempPytestProject(PYTEST_FIXTURE.FAILING, async ({ projectRoot }) => {
        capturedProjectRoot = projectRoot;
        expect(await pathExists(projectRoot)).toBe(true);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await pathExists(capturedProjectRoot)).toBe(false);
  });
});
