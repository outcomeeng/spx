import { realpath } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { withGitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";
import {
  detectProductRootsInChildProcess,
  POLLUTED_GIT_ENVIRONMENT,
} from "@testing/harnesses/state/product-root-probe";

describe("product root — git environment isolation", () => {
  it("GIVEN inherited GIT_DIR and GIT_WORK_TREE WHEN detecting product roots THEN the working directory's repository wins", async () => {
    await withGitWorktreeEnv(async (env) => {
      const root = await realpath(env.productDir);

      const roots = await detectProductRootsInChildProcess(root, POLLUTED_GIT_ENVIRONMENT);

      expect(roots.worktree.isGitRepo).toBe(true);
      expect(roots.worktree.warning).toBeUndefined();
      expect(roots.worktree.productDir).toBe(root);
      expect(roots.gitCommonDir.isGitRepo).toBe(true);
      expect(roots.gitCommonDir.warning).toBeUndefined();
      expect(roots.gitCommonDir.worktreeRoot).toBe(root);
      expect(roots.gitCommonDir.productDir).toBe(root);
    });
  });
});
