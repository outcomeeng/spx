import { describe, expect, it } from "vitest";

import { createIgnoreSourceReader } from "@/lib/file-inclusion/ignore-source";
import { GIT_TRACKING_LAYER, gitTrackingPredicate } from "@/lib/file-inclusion/predicates/git-tracking";
import {
  fileContent,
  ignoredPattern,
  readerConfig,
  submodulePath,
  trackedFilePath,
  untrackedFilePath,
} from "@testing/harnesses/file-inclusion/ignore-source";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("git-tracking predicate — scenarios", () => {
  it("reports matched false for git-tracked and untracked-not-ignored paths", async () => {
    await withGitWorktreeEnv(async (env) => {
      const tracked = trackedFilePath();
      const untracked = untrackedFilePath();
      await env.writeTracked(tracked, fileContent());
      await env.writeUntracked(untracked, fileContent());
      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(gitTrackingPredicate(tracked, { reader })).toEqual({ matched: false, layer: GIT_TRACKING_LAYER });
      expect(gitTrackingPredicate(untracked, { reader })).toEqual({ matched: false, layer: GIT_TRACKING_LAYER });
    });
  });

  it("reports matched true for gitignored paths missing from the git included set", async () => {
    await withGitWorktreeEnv(async (env) => {
      const ignored = ignoredPattern();
      await env.writeGitignore(".", ignored);
      await env.writeUntracked(ignored, fileContent());
      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(gitTrackingPredicate(ignored, { reader })).toEqual({ matched: true, layer: GIT_TRACKING_LAYER });
    });
  });

  it("reports matched true for paths inside submodule directories", async () => {
    await withGitWorktreeEnv(async (env) => {
      const submodule = submodulePath();
      const submoduleContent = trackedFilePath();
      await env.addSubmodule(submodule);
      const reader = createIgnoreSourceReader(env.productDir, readerConfig());

      expect(gitTrackingPredicate(`${submodule}/${submoduleContent}`, { reader })).toEqual({
        matched: true,
        layer: GIT_TRACKING_LAYER,
      });
    });
  });
});
