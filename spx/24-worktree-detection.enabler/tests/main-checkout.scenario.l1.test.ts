import { describe, expect, it } from "vitest";

import { detectMainCheckout } from "@/git/root";
import { arbitraryBranchName, sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
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
