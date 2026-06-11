import { describe, expect, it } from "vitest";

import { detectMainCheckout } from "@/git/root";
import {
  arbitraryBarePoolSpec,
  arbitraryBranchName,
  sampleMainCheckoutTestValue,
} from "@testing/generators/main-checkout/main-checkout";
import { withBarePoolEnv } from "@testing/harnesses/bare-pool/bare-pool";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("detectMainCheckout — single-tree layout", () => {
  it("treats the lone working tree as the main checkout whatever branch it holds", async () => {
    await withGitWorktreeEnv(async (env) => {
      expect(await detectMainCheckout(env.productDir)).toBe(true);

      const branch = sampleMainCheckoutTestValue(arbitraryBranchName());
      await env.runGit([GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.NEW_BRANCH, branch]);

      expect(await detectMainCheckout(env.productDir)).toBe(true);
    });
  });
});

describe("detectMainCheckout — bare-repository pool", () => {
  it("treats the origin-repository-named worktree as the main checkout and a feature worktree as not", async () => {
    const spec = sampleMainCheckoutTestValue(arbitraryBarePoolSpec());
    await withBarePoolEnv(spec, async (env) => {
      expect(await detectMainCheckout(env.mainCheckoutDir)).toBe(true);
      expect(await detectMainCheckout(env.featureWorktreeDir)).toBe(false);
    });
  });
});
