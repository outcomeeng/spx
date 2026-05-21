import { describe, expect, it } from "vitest";

import { buildGitTestEnvironment, GITHUB_ACTIONS_REPORTER_TRIGGER_KEY } from "@testing/harnesses/git-test-constants";

describe("buildGitTestEnvironment — GitHub Actions reporter env hygiene", () => {
  it("ALWAYS: strips the GitHub Actions reporter trigger regardless of host value", () => {
    const priorValue = process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY];
    process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY] = priorValue ?? "intentional sentinel";

    try {
      const env = buildGitTestEnvironment();

      expect(env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY]).toBeUndefined();
    } finally {
      if (priorValue === undefined) {
        delete process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY];
      } else {
        process.env[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY] = priorValue;
      }
    }
  });
});
