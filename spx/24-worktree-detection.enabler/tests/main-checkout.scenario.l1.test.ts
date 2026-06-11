import { describe, expect, it } from "vitest";

import { detectMainCheckout } from "@/git/root";
import {
  arbitraryBarePoolLayoutCase,
  arbitraryNonBareLinkedLayoutCase,
  arbitrarySingleTreeLayoutCase,
  sampleMainCheckoutTestValue,
  type WorktreeLayoutCase,
} from "@testing/generators/main-checkout/main-checkout";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

async function assertDetection(layout: WorktreeLayoutCase): Promise<void> {
  await withWorktreeLayoutEnv(layout.spec, async (env) => {
    expect(await detectMainCheckout(env.worktree(layout.mainCheckoutName))).toBe(true);
    for (const name of layout.otherNames) {
      expect(await detectMainCheckout(env.worktree(name))).toBe(false);
    }
  });
}

describe("detectMainCheckout — single-tree layout", () => {
  it("treats the lone working tree as the main checkout whatever branch it holds", async () => {
    await assertDetection(sampleMainCheckoutTestValue(arbitrarySingleTreeLayoutCase()));
  });
});

describe("detectMainCheckout — non-bare repository with a linked worktree", () => {
  it("treats the main working tree as the main checkout and the linked worktree as not", async () => {
    await assertDetection(sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase()));
  });
});

describe("detectMainCheckout — bare-repository pool", () => {
  it("treats the origin-repository-named worktree as the main checkout and a feature worktree as not", async () => {
    await assertDetection(sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase()));
  });
});
