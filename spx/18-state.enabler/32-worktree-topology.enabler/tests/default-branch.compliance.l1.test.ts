import { describe, expect, it } from "vitest";

import { resolveDefaultBranch } from "@/lib/git/root";
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { GIT_TEST_REF, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

describe("resolveDefaultBranch — origin/HEAD's target", () => {
  it("returns no branch when origin/HEAD is unset, and returns the branch named by origin/HEAD for generated branch names", async () => {
    await withGitWorktreeEnv(async (env) => {
      expect(await resolveDefaultBranch(env.productDir)).toBeNull();

      const branch = sampleMainCheckoutTestValue(arbitraryBranchName());
      await env.runGit([
        GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF,
        `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${GIT_TEST_REF.HEAD_NAME}`,
        `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${branch}`,
      ]);

      expect(await resolveDefaultBranch(env.productDir)).toBe(branch);

      const otherBranch = sampleMainCheckoutTestValue(
        arbitraryBranchName().filter((candidate) => candidate !== branch),
      );
      await env.runGit([
        GIT_TEST_SUBCOMMANDS.SYMBOLIC_REF,
        `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${GIT_TEST_REF.HEAD_NAME}`,
        `${GIT_TEST_REF.REMOTE_ORIGIN_PREFIX}${otherBranch}`,
      ]);

      expect(await resolveDefaultBranch(env.productDir)).toBe(otherBranch);
    });
  });
});
