/**
 * Git-ceiling scenario over a real child process and real Git: a directory inside a run root that lives
 * in a Git worktree is invisible to Git under the exported environment, and visible once the exported
 * ceiling is removed, so the ceiling alone hides the enclosing repository.
 */

import { describe, expect, it } from "vitest";

import { GIT_TEST_OUTPUT } from "@testing/harnesses/git-test-constants";
import { TEMP_DIRECTORY_CHILD_MODE } from "@testing/harnesses/temp-directory/child-protocol";
import { runTempDirectoryChild } from "@testing/harnesses/temp-directory/process";

describe("git run inside a directory of a run root", () => {
  it("finds no repository under the exported environment while the enclosing repository exists", async () => {
    const run = await runTempDirectoryChild(TEMP_DIRECTORY_CHILD_MODE.GIT_PROBE);

    expect(run.exitCode).toBe(0);
    expect(run.report.gitWithoutCeiling?.exitCode).toBe(0);
    expect(run.report.gitWithoutCeiling?.stdout.trim()).toBe(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE);
    expect(run.report.gitUnderExportedEnvironment?.exitCode).not.toBe(0);
    expect(run.report.gitUnderExportedEnvironment?.stdout).toHaveLength(0);
  });
});
