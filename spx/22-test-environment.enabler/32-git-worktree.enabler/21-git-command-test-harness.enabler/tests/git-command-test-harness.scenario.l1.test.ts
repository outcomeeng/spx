import { describe, expect, it } from "vitest";

import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import {
  buildGitTestEnvironment,
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_OUTPUT,
  GITHUB_ACTIONS_REPORTER_TRIGGER_KEY,
} from "@testing/harnesses/git-test-constants";

describe("git command test harness scenario", () => {
  it("strips ambient git and GitHub Actions context while preserving non-git overrides", () => {
    const preservedKey = sampleLiteralTestValue(arbitraryDomainLiteral());
    const cleaned = buildGitTestEnvironment({
      [GIT_TEST_ENVIRONMENT_KEYS.DIR]: GIT_TEST_OUTPUT.MISSING_ENV_VALUE,
      [GIT_TEST_ENVIRONMENT_KEYS.WORK_TREE]: GIT_TEST_OUTPUT.MISSING_ENV_VALUE,
      [GITHUB_ACTIONS_REPORTER_TRIGGER_KEY]: GIT_TEST_OUTPUT.MISSING_ENV_VALUE,
      [preservedKey]: GIT_TEST_OUTPUT.MISSING_ENV_VALUE,
    });

    expect(cleaned[GIT_TEST_ENVIRONMENT_KEYS.DIR]).toBeUndefined();
    expect(cleaned[GIT_TEST_ENVIRONMENT_KEYS.WORK_TREE]).toBeUndefined();
    expect(cleaned[GITHUB_ACTIONS_REPORTER_TRIGGER_KEY]).toBeUndefined();
    expect(cleaned.GIT_CONFIG_GLOBAL).toMatch(/^\/dev\/null$/u);
    expect(cleaned[preservedKey]).toBe(GIT_TEST_OUTPUT.MISSING_ENV_VALUE);
  });
});
