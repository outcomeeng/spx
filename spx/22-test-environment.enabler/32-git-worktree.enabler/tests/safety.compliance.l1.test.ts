import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_FLAGS, GIT_TEST_OUTPUT, GIT_TEST_SUBCOMMANDS, readGit } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("withGitWorktreeEnv — safety and GIT_* isolation", () => {
  it("ALWAYS: productDir is rooted under os.tmpdir()", async () => {
    await withGitWorktreeEnv(async (env) => {
      expect(env.productDir.startsWith(tmpdir())).toBe(true);
    });
  });

  describe("with a caller-set GIT_DIR before invocation", () => {
    let priorGitDir: string | undefined;
    let bogusGitDir = "";

    beforeEach(() => {
      priorGitDir = process.env.GIT_DIR;
      bogusGitDir = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.bogusGitDir());
      process.env.GIT_DIR = bogusGitDir;
    });

    afterEach(() => {
      if (priorGitDir === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = priorGitDir;
      }
    });

    it("strips GIT_DIR inside the callback so harness git invocations use productDir", async () => {
      await withGitWorktreeEnv(async (env) => {
        expect(process.env.GIT_DIR).toBeUndefined();
        const insideWorktree = await readGit(env.productDir, [
          GIT_TEST_SUBCOMMANDS.REV_PARSE,
          GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE,
        ]);
        expect(insideWorktree).toBe(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE);
      });
    });

    it("restores GIT_DIR to its prior value after the callback returns", async () => {
      await withGitWorktreeEnv(async () => {
        // body intentionally empty: we are observing post-callback restoration
      });

      expect(process.env.GIT_DIR).toBe(bogusGitDir);
    });
  });
});
