import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { detectGitCommonDirProductRoot, resolveLocalProductRoot } from "@/lib/git/root";
import {
  arbitraryBarePoolLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { arbitraryNestedProductLayout } from "@testing/generators/state/nested-product-layout";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { standsForConfigOnlyAtToplevel } from "@testing/harnesses/product-root/local-product-root";
import { materializeNestedProductLayout } from "@testing/harnesses/state/nested-product-layout";
import { createTempDir, removeTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("shared root", () => {
  it("shared-root-pool-worktree: a worktree of a bare-repository pool resolves its shared root to the parent of the git-common-dir", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const mainCheckout = await realpath(env.worktree(layout.mainCheckoutName));
      const result = await detectGitCommonDirProductRoot(env.worktree(layout.mainCheckoutName));
      expect(result.isGitRepo).toBe(true);
      expect(result.worktreeRoot).toBe(mainCheckout);
      // The pool's shared root is the container — the parent of the bare repo and of every worktree.
      expect(result.productDir).toBe(dirname(mainCheckout));
    });
  });

  it("shared-root-single-clone: a non-worktree repository resolves its shared root to its own worktree root", async () => {
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

describe("local root", () => {
  it("local-root-config-at-toplevel: an invocation directory below the toplevel, with `spx.config.*` only at the toplevel, resolves to the toplevel", async () => {
    const layout = sampleGeneratedValue(arbitraryNestedProductLayout().filter(standsForConfigOnlyAtToplevel));
    await materializeNestedProductLayout(layout, async ({ rootDir, invocationDir }) => {
      const result = await resolveLocalProductRoot(invocationDir);
      expect(result.isGitRepo).toBe(true);
      expect(await realpath(result.productDir)).toBe(await realpath(rootDir));
      expect(await realpath(invocationDir)).not.toBe(await realpath(rootDir));
      expect(result.warning).toBeUndefined();
    });
  });

  it("local-root-outside-git: an invocation directory outside any git repository resolves to that directory, with a warning", async () => {
    const outsideGit = await createTempDir("spx-non-repo-");
    try {
      const invocationDir = join(outsideGit, ".");
      const result = await resolveLocalProductRoot(invocationDir);
      expect(result.isGitRepo).toBe(false);
      expect(result.productDir).toBe(invocationDir);
      expect(result.warning).toBeDefined();
    } finally {
      await removeTempDir(outsideGit);
    }
  });
});
