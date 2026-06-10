import * as fc from "fast-check";

import type { GitFacts } from "@/git/root";

const PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const POSIX_SEPARATOR = "/";
const BARE_REPO_SUFFIX = ".git";
const GIT_DIR_NAME = ".git";

/**
 * A `GitFacts` value paired with the absolute main-checkout path it designates,
 * constructed independently of the function under test so the path is a known
 * oracle. `expectedPath` is null when the layout designates no main checkout.
 */
export type MainCheckoutPathCase = {
  readonly facts: GitFacts;
  readonly expectedPath: string | null;
};

/**
 * Generated git-plumbing observations describing one bare-pool worktree, in the
 * agreeing main-checkout configuration and four single-signal perturbations of
 * it. Each `GitFacts` is built from generated path segments and branch names so
 * the classifier is exercised over the domain rather than one hand-picked tree.
 */
export type PoolFactsSample = {
  /** All three pool signals agree — the worktree is the main checkout. */
  readonly mainCheckout: GitFacts;
  /** Checked-out branch differs from the default branch. */
  readonly branchMismatch: GitFacts;
  /** Worktree directory basename differs from the default branch. */
  readonly basenameMismatch: GitFacts;
  /** Common-dir parent is not the worktree's parent (not beside the bare repo). */
  readonly siblingMismatch: GitFacts;
  /** `origin/HEAD` is unset, so the default branch is unresolved. */
  readonly defaultBranchUnset: GitFacts;
};

export function sampleMainCheckoutTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const [value] = fc.sample(arbitrary, { numRuns: 1 });
  if (value === undefined) {
    throw new Error("Main-checkout test generator returned no sample");
  }
  return value;
}

function arbitraryPathSegment(): fc.Arbitrary<string> {
  return fc.stringMatching(PATH_SEGMENT_PATTERN);
}

export function arbitraryBranchName(): fc.Arbitrary<string> {
  return arbitraryPathSegment();
}

export function arbitraryPoolFactsSample(): fc.Arbitrary<PoolFactsSample> {
  return fc
    .record({
      containerParent: arbitraryPathSegment(),
      containerName: arbitraryPathSegment(),
      bareRepoName: arbitraryPathSegment(),
      otherContainerName: arbitraryPathSegment(),
      defaultBranch: arbitraryBranchName(),
      otherBranch: arbitraryBranchName(),
      otherBasename: arbitraryPathSegment(),
    })
    .filter(({ defaultBranch, otherBranch, otherBasename }) =>
      otherBranch !== defaultBranch && otherBasename !== defaultBranch
    )
    .map(
      (
        { containerParent, containerName, bareRepoName, otherContainerName, defaultBranch, otherBranch, otherBasename },
      ) => {
        const container = `${POSIX_SEPARATOR}${containerParent}${POSIX_SEPARATOR}${containerName}`;
        const commonDir = `${container}${POSIX_SEPARATOR}${bareRepoName}${BARE_REPO_SUFFIX}`;
        const worktreeRoot = `${container}${POSIX_SEPARATOR}${defaultBranch}`;
        const mainCheckout: GitFacts = {
          worktreeRoot,
          commonDir,
          commonDirIsBare: true,
          currentBranch: defaultBranch,
          defaultBranch,
        };
        return {
          mainCheckout,
          branchMismatch: { ...mainCheckout, currentBranch: otherBranch },
          basenameMismatch: { ...mainCheckout, worktreeRoot: `${container}${POSIX_SEPARATOR}${otherBasename}` },
          siblingMismatch: {
            ...mainCheckout,
            commonDir: `${POSIX_SEPARATOR}${otherContainerName}${POSIX_SEPARATOR}${bareRepoName}${BARE_REPO_SUFFIX}`,
          },
          defaultBranchUnset: { ...mainCheckout, defaultBranch: null },
        };
      },
    );
}

function arbitrarySingleTreePathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc
    .record({
      parent: arbitraryPathSegment(),
      repoName: arbitraryPathSegment(),
      currentBranch: fc.option(arbitraryBranchName(), { nil: null }),
      defaultBranch: fc.option(arbitraryBranchName(), { nil: null }),
    })
    .map(({ parent, repoName, currentBranch, defaultBranch }) => {
      const worktreeRoot = `${POSIX_SEPARATOR}${parent}${POSIX_SEPARATOR}${repoName}`;
      const commonDir = `${worktreeRoot}${POSIX_SEPARATOR}${GIT_DIR_NAME}`;
      return {
        facts: { worktreeRoot, commonDir, commonDirIsBare: false, currentBranch, defaultBranch },
        expectedPath: worktreeRoot,
      };
    });
}

/**
 * A `MainCheckoutPathCase` for a linked worktree of a non-bare repository: the
 * common directory's parent is the main working tree, and the linked worktree
 * resolves the same main-checkout path even though it is not itself the main
 * checkout. The linked worktree is named after the default branch and sits
 * beside the main tree — the configuration the bare-pool three-signal rule would
 * accept — so the case proves bareness, not directory shape, drives designation.
 */
function arbitraryNonBareLinkedPathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc
    .record({
      parent: arbitraryPathSegment(),
      repoName: arbitraryPathSegment(),
      defaultBranch: arbitraryBranchName(),
    })
    .map(({ parent, repoName, defaultBranch }) => {
      const mainTree = `${POSIX_SEPARATOR}${parent}${POSIX_SEPARATOR}${repoName}`;
      const commonDir = `${mainTree}${POSIX_SEPARATOR}${GIT_DIR_NAME}`;
      const worktreeRoot = `${mainTree}${POSIX_SEPARATOR}${defaultBranch}`;
      return {
        facts: { worktreeRoot, commonDir, commonDirIsBare: false, currentBranch: defaultBranch, defaultBranch },
        expectedPath: mainTree,
      };
    });
}

function arbitraryPoolPathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc
    .record({
      containerParent: arbitraryPathSegment(),
      containerName: arbitraryPathSegment(),
      bareRepoName: arbitraryPathSegment(),
      worktreeDir: arbitraryPathSegment(),
      currentBranch: fc.option(arbitraryBranchName(), { nil: null }),
      defaultBranch: fc.option(arbitraryBranchName(), { nil: null }),
    })
    .map(({ containerParent, containerName, bareRepoName, worktreeDir, currentBranch, defaultBranch }) => {
      const container = `${POSIX_SEPARATOR}${containerParent}${POSIX_SEPARATOR}${containerName}`;
      const commonDir = `${container}${POSIX_SEPARATOR}${bareRepoName}${BARE_REPO_SUFFIX}`;
      const worktreeRoot = `${container}${POSIX_SEPARATOR}${worktreeDir}`;
      return {
        facts: { worktreeRoot, commonDir, commonDirIsBare: true, currentBranch, defaultBranch },
        expectedPath: defaultBranch === null
          ? null
          : `${container}${POSIX_SEPARATOR}${defaultBranch}`,
      };
    });
}

export function arbitraryMainCheckoutPathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc.oneof(
    arbitrarySingleTreePathCase(),
    arbitraryPoolPathCase(),
    arbitraryNonBareLinkedPathCase(),
  );
}

/**
 * `GitFacts` for a checkout that IS the main checkout — the lone worktree of a
 * single-tree layout, or the qualifying default-branch worktree of a bare pool.
 */
export function arbitraryMainCheckoutFacts(): fc.Arbitrary<GitFacts> {
  return fc.oneof(
    arbitrarySingleTreePathCase().map((pathCase) => pathCase.facts),
    arbitraryPoolFactsSample().map((sample) => sample.mainCheckout),
  );
}

/**
 * `GitFacts` for a linked worktree of a non-bare repository, named after the
 * default branch and checked out on it — the directory shape the bare-pool rule
 * would accept, yet not the main checkout because the repository is non-bare.
 */
export function arbitraryNonBareLinkedFacts(): fc.Arbitrary<GitFacts> {
  return arbitraryNonBareLinkedPathCase().map((pathCase) => pathCase.facts);
}
