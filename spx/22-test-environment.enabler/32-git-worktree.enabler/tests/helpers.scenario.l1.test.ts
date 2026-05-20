import { describe, expect, it } from "vitest";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";
import { GIT_TEST_FLAGS, GIT_TEST_OUTPUT, GIT_TEST_SUBCOMMANDS, readGit } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("withGitWorktreeEnv — file helpers", () => {
  it("writeTracked followed by commit places the path in `git ls-files --cached`", async () => {
    await withGitWorktreeEnv(async (env) => {
      const relativePath = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.trackedFilePath());
      const content = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.fileContent());
      await env.writeTracked(relativePath, content);
      await env.commit("seed");

      const cached = await readGit(env.productDir, [GIT_TEST_SUBCOMMANDS.LS_FILES, GIT_TEST_FLAGS.CACHED]);

      expect(cached.split("\n")).toContain(relativePath);
    });
  });

  it("writeUntracked places the path under `git ls-files --others --exclude-standard --full-name`", async () => {
    await withGitWorktreeEnv(async (env) => {
      const relativePath = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.untrackedFilePath());
      const content = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.fileContent());
      await env.writeUntracked(relativePath, content);

      const others = await readGit(env.productDir, [
        GIT_TEST_SUBCOMMANDS.LS_FILES,
        GIT_TEST_FLAGS.OTHERS,
        GIT_TEST_FLAGS.EXCLUDE_STANDARD,
        GIT_TEST_FLAGS.FULL_NAME,
      ]);

      expect(others.split("\n")).toContain(relativePath);
    });
  });

  it("addSubmodule registers the submodule path as a single entry and excludes its contents", async () => {
    await withGitWorktreeEnv(async (env) => {
      const submodulePath = sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.submodulePath());
      await env.addSubmodule(submodulePath);

      const cached = await readGit(env.productDir, [
        GIT_TEST_SUBCOMMANDS.LS_FILES,
        GIT_TEST_FLAGS.CACHED,
        GIT_TEST_FLAGS.FULL_NAME,
      ]);
      const entries = cached.split("\n").filter((entry) => entry.length > 0);

      expect(entries).toContain(submodulePath);
      const insideSubmodule = entries.filter((entry) => entry.startsWith(`${submodulePath}/`));
      expect(insideSubmodule).toEqual([]);
    });
  });

  it("runGit returns trimmed stdout from a git invocation against productDir", async () => {
    await withGitWorktreeEnv(async (env) => {
      const insideWorktree = await env.runGit([GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_FLAGS.IS_INSIDE_WORK_TREE]);

      expect(insideWorktree).toBe(GIT_TEST_OUTPUT.IS_INSIDE_WORK_TREE_TRUE);
    });
  });
});
