import { describe, expect, it } from "vitest";

import {
  CORE_EXCLUDES_FILE_CONFIG_KEY,
  createIgnoreSourceReader,
  GIT_MISSING_CONTEXT_MESSAGE,
} from "@/lib/file-inclusion/ignore-source";
import { GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

import {
  fileContent,
  readerConfig,
  submodulePath,
  trackedFilePath,
} from "@testing/harnesses/file-inclusion/ignore-source";

describe("ignore-source — compliance", () => {
  it("query methods remain stable after the worktree changes", async () => {
    await withGitWorktreeEnv(async (env) => {
      const tracked = trackedFilePath();
      await env.writeTracked(tracked, fileContent());
      const reader = createIgnoreSourceReader(env.productDir, readerConfig());
      await env.writeGitignore(".", tracked);

      expect(reader.isInIncludedSet(tracked)).toBe(true);
      expect(reader.isInIncludedSet(tracked)).toBe(true);
    });
  });

  it("descendant membership is derived from indexed included-path parents", async () => {
    await withGitWorktreeEnv(async (env) => {
      const parent = submodulePath();
      const child = `${parent}/${trackedFilePath()}`;
      await env.writeTracked(child, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.hasIncludedDescendant(parent)).toBe(true);
      expect(reader.hasIncludedDescendant(child)).toBe(false);
    });
  });

  it("root descendant membership follows the constructed included set", async () => {
    await withGitWorktreeEnv(async (env) => {
      const tracked = trackedFilePath();
      await env.writeTracked(tracked, fileContent());

      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(reader.hasIncludedDescendant("")).toBe(true);
      expect(reader.hasIncludedDescendant(".")).toBe(true);
    });
  });

  it("preserves git failures inside a worktree as non-context failures", async () => {
    await withGitWorktreeEnv(async (env) => {
      await env.writeTracked(trackedFilePath(), fileContent());
      await env.runGit([GIT_TEST_SUBCOMMANDS.CONFIG, CORE_EXCLUDES_FILE_CONFIG_KEY, env.productDir]);

      let thrown: unknown;
      try {
        createIgnoreSourceReader(env.productDir, readerConfig({ noIgnoreVcs: true }));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const error = thrown instanceof Error ? thrown : undefined;
      expect(error?.message).toContain(env.productDir);
      expect(error?.message).not.toContain(GIT_MISSING_CONTEXT_MESSAGE);
      expect(error?.cause).toBeDefined();
    });
  });
});
