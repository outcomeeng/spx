import { describe, expect, it } from "vitest";

import {
  GIT_TEST_EXECUTABLE,
  GIT_TEST_OUTPUT,
  GITHUB_ACTIONS_REPORTER_TRIGGER_KEY,
} from "@testing/harnesses/git-test-constants";
import { withGitEnv } from "@testing/harnesses/with-git-env";

describe("buildGitTestEnvironment — GitHub Actions reporter env hygiene", () => {
  it("ALWAYS: strips the GitHub Actions reporter trigger from subprocesses spawned through the git harness", async () => {
    const priorValue = process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY];
    process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY] = priorValue ?? "intentional sentinel";

    try {
      await withGitEnv(async ({ exec }) => {
        const result = await exec([
          GIT_TEST_EXECUTABLE.NODE,
          "-e",
          `process.stdout.write(process.env[${JSON.stringify(GITHUB_ACTIONS_REPORTER_TRIGGER_KEY)}] ?? ${
            JSON.stringify(GIT_TEST_OUTPUT.MISSING_ENV_VALUE)
          })`,
        ]);

        expect(result.stdout).toBe(GIT_TEST_OUTPUT.MISSING_ENV_VALUE);
      });
    } finally {
      if (priorValue === undefined) {
        delete process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY];
      } else {
        process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY] = priorValue;
      }
    }
  });
});
