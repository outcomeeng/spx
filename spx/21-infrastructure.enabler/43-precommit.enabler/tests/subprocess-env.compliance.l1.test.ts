import { describe, expect, it } from "vitest";

import { assertGitHarnessStripsGithubActionsReporterEnv } from "@testing/harnesses/precommit/subprocess-env";

describe("buildGitTestEnvironment — GitHub Actions reporter env hygiene", () => {
  it("ALWAYS: strips the GitHub Actions reporter trigger from subprocesses spawned through the git harness", async () => {
    await expect(assertGitHarnessStripsGithubActionsReporterEnv()).resolves.toBeUndefined();
  });
});
