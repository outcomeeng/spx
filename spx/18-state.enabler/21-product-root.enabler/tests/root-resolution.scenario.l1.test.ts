import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { detectGitCommonDirProductRoot, detectWorktreeProductRoot } from "@/lib/git/root";
import {
  arbitraryBarePoolLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("detectGitCommonDirProductRoot — shared root resolves to the common-dir parent", () => {
  it("resolves a bare-pool worktree to the parent of the git-common-dir and a single clone to its own worktree root", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckout = await realpath(env.worktree(layout.mainCheckoutName));
      const result = await detectGitCommonDirProductRoot(env.worktree(layout.mainCheckoutName));
      expect(result.isGitRepo).toBe(true);
      expect(result.worktreeRoot).toBe(mainCheckout);
      // The pool's shared root is the container — the parent of the bare repo and of every worktree.
      expect(result.productDir).toBe(dirname(mainCheckout));
    });

    await withGitWorktreeEnv(async (env) => {
      const root = await realpath(env.productDir);
      const result = await detectGitCommonDirProductRoot(env.productDir);
      expect(result.isGitRepo).toBe(true);
      // A single clone's common dir is `<root>/.git`, so its parent is the worktree root itself.
      expect(result.worktreeRoot).toBe(root);
      expect(result.productDir).toBe(root);
    });
  });
});

describe("detectWorktreeProductRoot — local root resolves to the worktree toplevel", () => {
  it("resolves a checkout to its worktree root and falls back to the working directory with a warning outside a git repository", async () => {
    await withGitWorktreeEnv(async (env) => {
      const root = await realpath(env.productDir);
      const result = await detectWorktreeProductRoot(env.productDir);
      expect(result.isGitRepo).toBe(true);
      expect(result.productDir).toBe(root);
      expect(result.warning).toBeUndefined();
    });

    const nonRepoDir = await createTempDir("spx-non-repo-");
    try {
      const result = await detectWorktreeProductRoot(nonRepoDir);
      expect(result.isGitRepo).toBe(false);
      expect(result.productDir).toBe(nonRepoDir);
      expect(result.warning).toBeDefined();
    } finally {
      await removeTempDir(nonRepoDir);
    }
  });
});
