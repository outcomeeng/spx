import { describe, expect, it } from "vitest";

import {
  GIT_TEST_COMMAND,
  GIT_TEST_CONFIG,
  GIT_TEST_EXECUTABLE,
  GIT_TEST_FLAGS,
  GIT_TEST_OUTPUT,
  GIT_TEST_REF,
  GIT_TEST_SUBCOMMANDS,
  gitArgsEqual,
} from "@testing/harnesses/git-test-constants";

describe("git command test harness mapping", () => {
  it("maps git command vocabulary through source-owned constants", () => {
    expect(GIT_TEST_COMMAND).toMatch(/^git$/u);
    expect(GIT_TEST_SUBCOMMANDS.INIT).toMatch(/^init$/u);
    expect(GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE).toMatch(/^--is-inside-work-tree$/u);
    expect(GIT_TEST_REF.HEAD_NAME).toMatch(/^HEAD$/u);
    expect(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE).toMatch(/^true$/u);
    expect(GIT_TEST_EXECUTABLE.NODE).toMatch(/^node$/u);
    expect(GIT_TEST_CONFIG.EMAIL_KEY).toMatch(/^user\.email$/u);
    expect(gitArgsEqual([GIT_TEST_SUBCOMMANDS.INIT], [GIT_TEST_SUBCOMMANDS.INIT])).toBe(true);
    expect(gitArgsEqual([GIT_TEST_SUBCOMMANDS.INIT], [GIT_TEST_SUBCOMMANDS.CONFIG])).toBe(false);
  });
});
