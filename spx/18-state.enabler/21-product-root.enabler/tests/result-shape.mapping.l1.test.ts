import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectGitCommonDirProductRoot, detectWorktreeProductRoot } from "@/lib/git/root";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { createFailingGitDeps, createScriptedGitDeps, STATE_GIT_FAILURE_MODE } from "@testing/harnesses/state/git-deps";

describe("product root result shape", () => {
  it("maps the git-success outcome: the common-dir result carries worktreeRoot=toplevel and productDir=parent(common-dir); the worktree result omits worktreeRoot", async () => {
    const productDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const worktreeRoot = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.linkedWorktreeRoot(productDir));
    const commonDir = join(productDir, sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeToken()));

    const commonDirResult = await detectGitCommonDirProductRoot(
      worktreeRoot,
      createScriptedGitDeps([{ stdout: worktreeRoot, exitCode: 0 }, { stdout: commonDir, exitCode: 0 }]),
    );
    const worktreeResult = await detectWorktreeProductRoot(
      worktreeRoot,
      createScriptedGitDeps([{ stdout: worktreeRoot, exitCode: 0 }]),
    );

    expect(commonDirResult.productDir).toBe(dirname(commonDir));
    expect(commonDirResult.worktreeRoot).toBe(worktreeRoot);
    expect(worktreeResult.productDir).toBe(worktreeRoot);
    expect("worktreeRoot" in worktreeResult).toBe(false);
  });

  it("maps the common-dir-fallback outcome: a failed --git-common-dir read falls productDir and worktreeRoot back to the toplevel", async () => {
    const worktreeRoot = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());

    // Only --show-toplevel is scripted; the --git-common-dir call exhausts the
    // script and exits non-zero, driving the common-dir fallback.
    const result = await detectGitCommonDirProductRoot(
      worktreeRoot,
      createScriptedGitDeps([{ stdout: worktreeRoot, exitCode: 0 }]),
    );

    expect(result.productDir).toBe(worktreeRoot);
    expect(result.worktreeRoot).toBe(worktreeRoot);
  });

  it("maps the non-git outcome: worktreeRoot falls back to cwd and isGitRepo is false", async () => {
    const cwd = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());

    const result = await detectGitCommonDirProductRoot(cwd, createFailingGitDeps(STATE_GIT_FAILURE_MODE.NON_GIT));

    expect(result.isGitRepo).toBe(false);
    expect(result.worktreeRoot).toBe(cwd);
    expect(result.productDir).toBe(cwd);
  });

  it("maps the git-error outcome: the catch path returns worktreeRoot=cwd with isGitRepo false", async () => {
    const cwd = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());

    const result = await detectGitCommonDirProductRoot(cwd, createFailingGitDeps(STATE_GIT_FAILURE_MODE.GIT_ERROR));

    expect(result.isGitRepo).toBe(false);
    expect(result.worktreeRoot).toBe(cwd);
  });
});
