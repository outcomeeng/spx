import { realpath, stat } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  detectWorktreeProductRoot,
  GIT_ROOT_COMMAND,
  GIT_SHOW_TOPLEVEL_ARGS,
  NOT_GIT_REPO_WARNING_TEXT,
} from "@/lib/git/root";
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
import { detectProductRootsInChildProcess, withNonGitDirectory } from "@testing/harnesses/state/product-root-probe";
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

  it("simulates the non-git failure mode with a non-zero exit that drives each resolver to its not-in-git fallback", async () => {
    const cwd = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const deps = createFailingGitDeps(STATE_GIT_FAILURE_MODE.NON_GIT);

    const result = await deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_SHOW_TOPLEVEL_ARGS], { cwd });
    const worktree = await detectWorktreeProductRoot(cwd, deps);
    const gitCommonDir = await detectGitCommonDirProductRoot(cwd, deps);

    expect(result.exitCode).not.toBe(0);
    expect(worktree).toEqual({ productDir: cwd, isGitRepo: false, warning: NOT_GIT_REPO_WARNING_TEXT });
    expect(gitCommonDir).toEqual({
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING_TEXT,
      worktreeRoot: cwd,
    });
  });

  it("simulates the git-error failure mode by rejecting the invocation, which each resolver catches into its not-in-git result", async () => {
    const cwd = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const deps = createFailingGitDeps(STATE_GIT_FAILURE_MODE.GIT_ERROR);

    await expect(deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_SHOW_TOPLEVEL_ARGS], { cwd })).rejects.toThrow(
      STATE_GIT_ERROR_MESSAGE,
    );
    await expect(detectWorktreeProductRoot(cwd, deps)).resolves.toEqual({
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING_TEXT,
    });
    await expect(detectGitCommonDirProductRoot(cwd, deps)).resolves.toEqual({
      productDir: cwd,
      isGitRepo: false,
      warning: NOT_GIT_REPO_WARNING_TEXT,
      worktreeRoot: cwd,
    });
  });
});

describe("state test harness — product-root probe", () => {
  it("runs the resolvers in a child process and returns both product roots resolved there", async () => {
    await withGitWorktreeEnv(async (env) => {
      const root = await realpath(env.productDir);

      const roots = await detectProductRootsInChildProcess(root, {});

      expect(roots.worktree.productDir).toBe(root);
      expect(roots.gitCommonDir.productDir).toBe(root);
    });
  });

  it("returns the worktree and Git-common-dir roots as distinct values in a bare-pool worktree", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckout = await realpath(env.worktree(layout.mainCheckoutName));

      const roots = await detectProductRootsInChildProcess(mainCheckout, {});

      expect(roots.worktree.productDir).toBe(mainCheckout);
      expect(roots.gitCommonDir.productDir).toBe(dirname(mainCheckout));
    });
  });
});

describe("state test harness — non-git directory", () => {
  it("passes an existing directory outside every git repository and removes it after the callback returns or throws", async () => {
    const returnedDir = await withNonGitDirectory(async (dir) => {
      const entry = await stat(dir);
      const toplevel = await defaultGitDependencies.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...GIT_SHOW_TOPLEVEL_ARGS], {
        cwd: dir,
        reject: false,
      });

      expect(entry.isDirectory()).toBe(true);
      expect(toplevel.exitCode).not.toBe(0);
      return dir;
    });

    await expect(stat(returnedDir)).rejects.toThrow();

    const thrown = new Error();
    let thrownDir: string | undefined;
    await expect(
      withNonGitDirectory(async (dir) => {
        thrownDir = dir;
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    expect(thrownDir).toBeDefined();
    await expect(stat(thrownDir ?? returnedDir)).rejects.toThrow();
  });
});
