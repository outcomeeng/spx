import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

import { fileContent, readerConfig, trackedFilePath } from "@testing/harnesses/file-inclusion/ignore-source";

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
});
