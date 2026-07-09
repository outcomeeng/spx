import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import {
  arbitraryBarePoolLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import {
  createFailingGitDeps,
  createScriptedGitDeps,
  STATE_GIT_ERROR_MESSAGE,
  STATE_GIT_FAILURE_MODE,
} from "@testing/harnesses/state/git-deps";
import { detectProductRootsInChildProcess } from "@testing/harnesses/state/product-root-probe";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("state test harness — git-deps double", () => {
  it("returns each scripted response in call order", async () => {
    const first = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const second = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.linkedWorktreeRoot(first));
    const deps = createScriptedGitDeps([
      { stdout: first, exitCode: 0 },
      { stdout: second, exitCode: 0 },
    ]);

    const firstResult = await deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, []);
    const secondResult = await deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, []);

    expect(firstResult.stdout).toBe(first);
    expect(firstResult.exitCode).toBe(0);
    expect(secondResult.stdout).toBe(second);
    expect(secondResult.exitCode).toBe(0);
  });

  it("simulates the non-git failure mode with a non-zero exit for every command", async () => {
    const deps = createFailingGitDeps(STATE_GIT_FAILURE_MODE.NON_GIT);

    const result = await deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, []);

    expect(result.exitCode).not.toBe(0);
  });

  it("simulates the git-error failure mode by rejecting the invocation", async () => {
    const deps = createFailingGitDeps(STATE_GIT_FAILURE_MODE.GIT_ERROR);

    await expect(deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [])).rejects.toThrow(STATE_GIT_ERROR_MESSAGE);
  });
});

describe("state test harness — product-root probe", () => {
  it("runs the resolvers in a child process and returns both product roots resolved there", async () => {
    await withGitWorktreeEnv(async (env) => {
      const root = await realpath(env.productDir);

      const roots = await detectProductRootsInChildProcess(root, {});

      expect(roots.worktreeProductRoot).toBe(root);
      expect(roots.gitCommonDirProductRoot).toBe(root);
    });
  });

  it("returns the worktree and Git-common-dir roots as distinct values in a bare-pool worktree", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckout = await realpath(env.worktree(layout.mainCheckoutName));

      const roots = await detectProductRootsInChildProcess(mainCheckout, {});

      expect(roots.worktreeProductRoot).toBe(mainCheckout);
      expect(roots.gitCommonDirProductRoot).toBe(dirname(mainCheckout));
    });
  });
});
