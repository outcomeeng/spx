import { realpath } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { detectMainCheckout, gatherGitFacts } from "@/lib/git/root";
import { compareAsciiStrings } from "@/lib/state-store";
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import {
  arbitraryBarePoolLayoutCase,
  arbitraryBarePoolWithoutMainCheckoutLayoutCase,
  arbitraryNonBareLinkedLayoutCase,
  arbitraryOriginUrl,
  arbitraryRepositoryName,
  arbitrarySingleTreeLayoutCase,
  sampleMainCheckoutTestValue,
  type WorktreeLayoutCase,
} from "@testing/generators/main-checkout/main-checkout";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

function sortedPaths(paths: Iterable<string>): string[] {
  return [...paths].sort(compareAsciiStrings);
}

async function realpaths(paths: Iterable<string>): Promise<string[]> {
  return Promise.all([...paths].map((path) => realpath(path)));
}

async function assertDetection(layout: WorktreeLayoutCase): Promise<void> {
  await withWorktreeLayoutEnv(layout.spec, async (env) => {
    expect(await detectMainCheckout(env.worktree(layout.mainCheckoutName))).toBe(true);
    for (const name of layout.otherNames) {
      expect(await detectMainCheckout(env.worktree(name))).toBe(false);
    }
  });
}

describe("detectMainCheckout — single-tree layout", () => {
  it("treats the lone working tree as the main checkout across checked-out branch states", async () => {
    await assertDetection(sampleMainCheckoutTestValue(arbitrarySingleTreeLayoutCase()));
    const mainCheckoutName = sampleMainCheckoutTestValue(arbitraryRepositoryName());
    await assertDetection({
      spec: {
        bare: false,
        worktrees: [{
          name: mainCheckoutName,
          branch: sampleMainCheckoutTestValue(arbitraryBranchName()),
        }],
      },
      mainCheckoutName,
      otherNames: [],
    });
  });
});

describe("detectMainCheckout — non-bare repository with a linked worktree", () => {
  it("treats the main working tree as the main checkout and the linked worktree as not", async () => {
    await assertDetection(sampleMainCheckoutTestValue(arbitraryNonBareLinkedLayoutCase()));
  });
});

describe("detectMainCheckout — bare-repository pool", () => {
  it("treats the origin-repository-named worktree as the main checkout and a feature worktree as not across checked-out branch states", async () => {
    await assertDetection(sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase()));
    const repoName = "repo-main";
    const featureName = sampleMainCheckoutTestValue(
      arbitraryRepositoryName().filter((candidate) => candidate !== repoName),
    );
    await assertDetection({
      spec: {
        bare: true,
        bareName: "pool",
        origin: sampleMainCheckoutTestValue(arbitraryOriginUrl(repoName)),
        worktrees: [
          { name: repoName, branch: sampleMainCheckoutTestValue(arbitraryBranchName()) },
          { name: featureName, branch: featureName },
        ],
      },
      mainCheckoutName: repoName,
      otherNames: [featureName],
    });
  });

  it("treats every existing worktree as non-main when origin names a repository whose worktree is absent", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolWithoutMainCheckoutLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      expect(await detectMainCheckout(env.worktree(layout.nonMainCheckoutName))).toBe(false);
    });
  });

  it("reads the observed worktree list from git without appending synthetic roots", async () => {
    const layout = sampleMainCheckoutTestValue(arbitraryBarePoolLayoutCase());
    await withWorktreeLayoutEnv(layout.spec, async (env) => {
      const facts = await gatherGitFacts(env.worktree(layout.mainCheckoutName));

      expect(facts).not.toBeNull();
      expect(sortedPaths(await realpaths(facts?.worktreeRoots ?? []))).toEqual(
        sortedPaths(await realpaths(Object.values(env.worktrees))),
      );
    });
  });
});
