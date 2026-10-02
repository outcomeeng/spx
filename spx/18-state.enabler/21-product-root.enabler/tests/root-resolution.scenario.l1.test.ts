import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { detectGitCommonDirProductRoot, detectWorktreeProductRoot } from "@/lib/git/root";
import {
  arbitraryBarePoolLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withNonGitDirectory } from "@testing/harnesses/state/product-root-probe";
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

describe("detectWorktreeProductRoot — local root outside a git repository", () => {
  it("falls back to the working directory with a warning outside a git repository", async () => {
    await withNonGitDirectory(async (nonGitDir) => {
      const result = await detectWorktreeProductRoot(nonGitDir);
      expect(result.isGitRepo).toBe(false);
      expect(result.productDir).toBe(nonGitDir);
      expect(result.warning).toBeDefined();
    });
  });
});
