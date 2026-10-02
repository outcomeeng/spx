import { realpath } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { detectWorktreeProductRoot } from "@/lib/git/root";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { arbitraryCheckoutLayoutCases } from "@testing/generators/product-root/product-root";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

describe("detectWorktreeProductRoot — every checkout maps to its own worktree root", () => {
  it("maps each worktree of a single tree, a non-bare repository with a linked worktree, and a bare pool to that worktree's toplevel", async () => {
    for (const layout of sampleMainCheckoutTestValue(arbitraryCheckoutLayoutCases())) {
      await withWorktreeLayoutEnv(layout.spec, async (env) => {
        for (const [name, worktreePath] of Object.entries(env.worktrees)) {
          const result = await detectWorktreeProductRoot(worktreePath);

          expect(result.isGitRepo, name).toBe(true);
          expect(result.warning, name).toBeUndefined();
          expect(result.productDir, name).toBe(await realpath(worktreePath));
        }
      });
    }
  });
});
