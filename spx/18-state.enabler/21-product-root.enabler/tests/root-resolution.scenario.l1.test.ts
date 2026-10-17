import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { detectGitCommonDirProductRoot, detectLocalProductRoot } from "@/lib/git/root";
import {
  arbitraryBarePoolLayoutCase,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { LOCAL_PRODUCT_ROOT_LAYOUT, localProductRootCase } from "@testing/generators/product-root/local-product-root";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import { withLocalProductRootEnv } from "@testing/harnesses/product-root/local-product-root";
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

describe("detectLocalProductRoot — local root resolves per config layout", () => {
  it("resolves a nested invocation directory under a git toplevel holding the only config to that toplevel", async () => {
    await withLocalProductRootEnv(localProductRootCase(LOCAL_PRODUCT_ROOT_LAYOUT.TOPLEVEL_ONLY), async (env) => {
      const result = await detectLocalProductRoot(env.invocationDir);
      expect(result.isGitRepo).toBe(true);
      expect(await realpath(result.productDir)).toBe(env.expectedProductDir);
      expect(result.warning).toBeUndefined();
    });
  });

  it("falls back to the working directory with a warning outside a git repository", async () => {
    await withLocalProductRootEnv(localProductRootCase(LOCAL_PRODUCT_ROOT_LAYOUT.OUTSIDE_GIT), async (env) => {
      const result = await detectLocalProductRoot(env.invocationDir);
      expect(result.isGitRepo).toBe(false);
      expect(result.productDir).toBe(env.invocationDir);
      expect(result.warning).toBeDefined();
    });
  });
});
