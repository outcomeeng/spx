import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
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
});
