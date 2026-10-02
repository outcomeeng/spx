import * as fc from "fast-check";

import { GIT_DIR_BASENAME, GIT_URL_SUFFIX, type GitFacts } from "@/lib/git/root";
import { arbitraryBranchName, arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { SEED_BRANCH, type WorktreeLayoutSpec } from "@testing/harnesses/worktree-layout/worktree-layout";

const POSIX_SEPARATOR = "/";
const HTTPS_SCHEME = "https://";
const SCP_USER = "git@";
const HOST_TLD = ".com";
const SCP_PATH_SEPARATOR = ":";
const WINDOWS_DRIVE_PREFIX = "C:\\";
const WINDOWS_SEPARATOR = "\\";
const MAIN_CHECKOUT_SAMPLE_SEED = 0x4d4348;
let mainCheckoutSampleOffset = 0;

/** The `origin` URL forms git accepts, each carrying the repository name as its final segment. */
const ORIGIN_URL_FORM = {
  HTTPS: "https",
  HTTPS_NO_SUFFIX: "https-no-suffix",
  SCP: "scp",
  LOCAL_PATH: "local-path",
  WINDOWS_LOCAL_PATH: "windows-local-path",
} as const;

type OriginUrlForm = (typeof ORIGIN_URL_FORM)[keyof typeof ORIGIN_URL_FORM];

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
 * agreeing main-checkout configuration and the single-signal perturbations of
 * it. Each `GitFacts` is built from generated path segments and origin URLs so
 * the classifier is exercised over the domain rather than one hand-picked tree.
 */
export type PoolFactsSample = {
  /** Both pool signals agree and the origin resolves a name — the worktree is the main checkout. */
  readonly mainCheckout: GitFacts;
  /** Worktree directory basename differs from the `origin` repository name. */
  readonly basenameMismatch: GitFacts;
  /** Common-dir parent is not the worktree's parent (not beside the bare repo). */
  readonly siblingMismatch: GitFacts;
  /** `origin` is unset, so no repository name resolves. */
  readonly originUnset: GitFacts;
  /** The repository name resolves, but the repository-named worktree is absent from the observed list. */
  readonly missingDesignatedWorktree: GitFacts;
  /** The current worktree looks like the main checkout, but the observed worktree list omits it. */
  readonly unlistedMainCheckoutRoot: GitFacts;
  /** The observed list contains the main checkout with native Windows separators. */
  readonly separatorVariantMainCheckout: GitFacts;
  /** The current worktree has the bare-pool main-checkout shape, but the worktree list read failed. */
  readonly unreadableWorktreeList: GitFacts;
};

export function sampleMainCheckoutTestValue<T>(arbitrary: fc.Arbitrary<T>): T {
  const seed = MAIN_CHECKOUT_SAMPLE_SEED + mainCheckoutSampleOffset;
  mainCheckoutSampleOffset += 1;
  const [value] = fc.sample(arbitrary, { numRuns: 1, seed });
  if (value === undefined) {
    throw new Error("Main-checkout test generator returned no sample");
  }
  return value;
}

function toWindowsPath(path: string): string {
  return path.replaceAll(POSIX_SEPARATOR, WINDOWS_SEPARATOR);
}

export function arbitraryRepositoryName(): fc.Arbitrary<string> {
  return arbitraryPathSegment();
}

/**
 * An `origin` remote URL whose repository name — the final path segment minus a
 * `.git` suffix — equals `repoName`, drawn across the URL forms git accepts so a
 * consumer parsing the name is exercised over every shape rather than one.
 */
export function arbitraryOriginUrl(repoName: string): fc.Arbitrary<string> {
  return fc
    .record({
      host: arbitraryPathSegment(),
      owner: arbitraryPathSegment(),
      form: fc.constantFrom<OriginUrlForm>(
        ORIGIN_URL_FORM.HTTPS,
        ORIGIN_URL_FORM.HTTPS_NO_SUFFIX,
        ORIGIN_URL_FORM.SCP,
        ORIGIN_URL_FORM.LOCAL_PATH,
        ORIGIN_URL_FORM.WINDOWS_LOCAL_PATH,
      ),
      hasTrailingSeparator: fc.boolean(),
    })
    .map(({ host, owner, form, hasTrailingSeparator }) => {
      const ownerSlashRepo = `${owner}${POSIX_SEPARATOR}${repoName}`;
      switch (form) {
        case ORIGIN_URL_FORM.HTTPS: {
          const url = `${HTTPS_SCHEME}${host}${HOST_TLD}${POSIX_SEPARATOR}${ownerSlashRepo}${GIT_URL_SUFFIX}`;
          return hasTrailingSeparator ? `${url}${POSIX_SEPARATOR}` : url;
        }
        case ORIGIN_URL_FORM.HTTPS_NO_SUFFIX: {
          const url = `${HTTPS_SCHEME}${host}${HOST_TLD}${POSIX_SEPARATOR}${ownerSlashRepo}`;
          return hasTrailingSeparator ? `${url}${POSIX_SEPARATOR}` : url;
        }
        case ORIGIN_URL_FORM.SCP: {
          const url = `${SCP_USER}${host}${HOST_TLD}${SCP_PATH_SEPARATOR}${ownerSlashRepo}${GIT_URL_SUFFIX}`;
          return hasTrailingSeparator ? `${url}${POSIX_SEPARATOR}` : url;
        }
        case ORIGIN_URL_FORM.WINDOWS_LOCAL_PATH:
          return `${WINDOWS_DRIVE_PREFIX}${owner}${WINDOWS_SEPARATOR}${repoName}${GIT_URL_SUFFIX}${
            hasTrailingSeparator ? WINDOWS_SEPARATOR : ""
          }`;
        default: {
          const url = `${POSIX_SEPARATOR}${ownerSlashRepo}${GIT_URL_SUFFIX}`;
          return hasTrailingSeparator ? `${url}${POSIX_SEPARATOR}` : url;
        }
      }
    });
}

function arbitraryOptionalOriginUrl(): fc.Arbitrary<string | null> {
  return fc.option(
    arbitraryRepositoryName().chain((repoName) => arbitraryOriginUrl(repoName)),
    { nil: null },
  );
}

export function arbitraryPoolFactsSample(): fc.Arbitrary<PoolFactsSample> {
  return fc
    .record({
      containerParent: arbitraryPathSegment(),
      containerName: arbitraryPathSegment(),
      bareRepoName: arbitraryPathSegment(),
      otherContainerName: arbitraryPathSegment(),
      repoName: arbitraryRepositoryName(),
      otherBasename: arbitraryPathSegment(),
    })
    .filter(({ repoName, otherBasename, containerName, otherContainerName }) =>
      otherBasename !== repoName && otherContainerName !== containerName
    )
    .chain((parts) =>
      arbitraryOriginUrl(parts.repoName).map((originUrl) => {
        const container = `${POSIX_SEPARATOR}${parts.containerParent}${POSIX_SEPARATOR}${parts.containerName}`;
        const otherContainer =
          `${POSIX_SEPARATOR}${parts.containerParent}${POSIX_SEPARATOR}${parts.otherContainerName}`;
        const commonDir = `${container}${POSIX_SEPARATOR}${parts.bareRepoName}${GIT_URL_SUFFIX}`;
        const worktreeRoot = `${container}${POSIX_SEPARATOR}${parts.repoName}`;
        const otherWorktreeRoot = `${container}${POSIX_SEPARATOR}${parts.otherBasename}`;
        const mainCheckout: GitFacts = {
          worktreeRoot,
          worktreeRoots: [worktreeRoot],
          worktreeListRead: true,
          commonDir,
          commonDirIsBare: true,
          originUrl,
        };
        return {
          mainCheckout,
          basenameMismatch: {
            ...mainCheckout,
            worktreeRoot: otherWorktreeRoot,
            worktreeRoots: [worktreeRoot, otherWorktreeRoot],
          },
          // Same depth as the main checkout's container — only the container name
          // differs — so the parent-equality signal alone decides the mismatch.
          siblingMismatch: {
            ...mainCheckout,
            commonDir: `${otherContainer}${POSIX_SEPARATOR}${parts.bareRepoName}${GIT_URL_SUFFIX}`,
            worktreeRoots: [worktreeRoot],
          },
          originUnset: { ...mainCheckout, worktreeRoots: [worktreeRoot], originUrl: null },
          missingDesignatedWorktree: {
            ...mainCheckout,
            worktreeRoot: otherWorktreeRoot,
            worktreeRoots: [otherWorktreeRoot],
          },
          unlistedMainCheckoutRoot: {
            ...mainCheckout,
            worktreeRoots: [otherWorktreeRoot],
          },
          separatorVariantMainCheckout: {
            ...mainCheckout,
            worktreeRoots: [toWindowsPath(worktreeRoot)],
          },
          unreadableWorktreeList: {
            ...mainCheckout,
            worktreeRoots: [],
            worktreeListRead: false,
          },
        };
      })
    );
}

function arbitrarySingleTreePathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc
    .record({
      parent: arbitraryPathSegment(),
      repoName: arbitraryPathSegment(),
      originUrl: arbitraryOptionalOriginUrl(),
    })
    .map(({ parent, repoName, originUrl }) => {
      const worktreeRoot = `${POSIX_SEPARATOR}${parent}${POSIX_SEPARATOR}${repoName}`;
      const commonDir = `${worktreeRoot}${POSIX_SEPARATOR}${GIT_DIR_BASENAME}`;
      return {
        facts: {
          worktreeRoot,
          worktreeRoots: [worktreeRoot],
          worktreeListRead: true,
          commonDir,
          commonDirIsBare: false,
          originUrl,
        },
        expectedPath: worktreeRoot,
      };
    });
}

/**
 * A `MainCheckoutPathCase` for a linked worktree of a non-bare repository, nested
 * inside the main working tree at `mainTree/linkedDir`. Its parent is the main
 * tree — which is also the common directory's parent — so both bare-pool signals
 * hold (`basename === origin repository name`, and `dirname(worktreeRoot) ===` the
 * common-dir parent); only `commonDirIsBare === false` stops it being designated,
 * so the case proves bareness, not directory shape, drives designation. The
 * linked worktree still resolves the same main-checkout path (the main tree)
 * though it is not itself the main checkout.
 */
function arbitraryNonBareLinkedPathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc
    .record({
      parent: arbitraryPathSegment(),
      repoName: arbitraryPathSegment(),
      linkedDir: arbitraryRepositoryName(),
    })
    .chain((parts) =>
      arbitraryOriginUrl(parts.linkedDir).map((originUrl) => {
        const mainTree = `${POSIX_SEPARATOR}${parts.parent}${POSIX_SEPARATOR}${parts.repoName}`;
        const commonDir = `${mainTree}${POSIX_SEPARATOR}${GIT_DIR_BASENAME}`;
        const worktreeRoot = `${mainTree}${POSIX_SEPARATOR}${parts.linkedDir}`;
        return {
          facts: {
            worktreeRoot,
            worktreeRoots: [mainTree, worktreeRoot],
            worktreeListRead: true,
            commonDir,
            commonDirIsBare: false,
            originUrl,
          },
          expectedPath: mainTree,
        };
      })
    );
}

function arbitraryPoolPathCase(): fc.Arbitrary<MainCheckoutPathCase> {
  return fc
    .record({
      containerParent: arbitraryPathSegment(),
      containerName: arbitraryPathSegment(),
      bareRepoName: arbitraryPathSegment(),
      worktreeDir: arbitraryPathSegment(),
      repoName: arbitraryRepositoryName(),
      hasOrigin: fc.boolean(),
      hasDesignatedWorktree: fc.boolean(),
    })
    .filter(({ hasDesignatedWorktree, worktreeDir, repoName }) => hasDesignatedWorktree || worktreeDir !== repoName)
    .chain((parts) =>
      arbitraryOriginUrl(parts.repoName).map((originUrl) => {
        const container = `${POSIX_SEPARATOR}${parts.containerParent}${POSIX_SEPARATOR}${parts.containerName}`;
        const commonDir = `${container}${POSIX_SEPARATOR}${parts.bareRepoName}${GIT_URL_SUFFIX}`;
        const worktreeRoot = `${container}${POSIX_SEPARATOR}${parts.worktreeDir}`;
        const designatedWorktreeRoot = `${container}${POSIX_SEPARATOR}${parts.repoName}`;
        const worktreeRoots = parts.hasDesignatedWorktree
          ? [...new Set([worktreeRoot, designatedWorktreeRoot])]
          : [worktreeRoot];
        return {
          facts: {
            worktreeRoot,
            worktreeRoots,
            worktreeListRead: true,
            commonDir,
            commonDirIsBare: true,
            originUrl: parts.hasOrigin ? originUrl : null,
          },
          expectedPath: parts.hasOrigin && parts.hasDesignatedWorktree ? designatedWorktreeRoot : null,
        };
      })
    );
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
 * single-tree layout, or the qualifying `origin`-repository-named worktree of a
 * bare pool.
 */
export function arbitraryMainCheckoutFacts(): fc.Arbitrary<GitFacts> {
  return fc.oneof(
    arbitrarySingleTreePathCase().map((pathCase) => pathCase.facts),
    arbitraryPoolFactsSample().map((sample) => sample.mainCheckout),
  );
}

/**
 * `GitFacts` for a linked worktree of a non-bare repository, named after the
 * `origin` repository — the directory shape the bare-pool rule would accept, yet
 * not the main checkout because the repository is non-bare.
 */
export function arbitraryNonBareLinkedFacts(): fc.Arbitrary<GitFacts> {
  return arbitraryNonBareLinkedPathCase().map((pathCase) => pathCase.facts);
}

/**
 * `GitFacts` for the main working tree of a non-bare repository — the parent of
 * its common directory — which IS the main checkout whatever branch it holds.
 */
export function arbitraryNonBareMainFacts(): fc.Arbitrary<GitFacts> {
  return arbitrarySingleTreePathCase().map((pathCase) => pathCase.facts);
}

/**
 * A `WorktreeLayoutSpec` paired with the worktree names a real-git test asserts
 * against: `mainCheckoutName` is the worktree `detectMainCheckout` must accept, and
 * `otherNames` are the worktrees it must reject.
 */
export type WorktreeLayoutCase = {
  readonly spec: WorktreeLayoutSpec;
  readonly mainCheckoutName: string;
  readonly otherNames: readonly string[];
};

/** A bare-pool layout with no origin, so no main-checkout path is designable. */
export type BarePoolWithoutOriginLayoutCase = {
  readonly spec: WorktreeLayoutSpec;
  readonly nonMainCheckoutName: string;
};

/** A bare-pool layout whose `origin` names a repository but whose named worktree is absent. */
export type BarePoolWithoutMainCheckoutLayoutCase = {
  readonly spec: WorktreeLayoutSpec;
  readonly nonMainCheckoutName: string;
};

/** A non-bare single-tree layout: the lone working tree is the main checkout on any branch. */
export function arbitrarySingleTreeLayoutCase(): fc.Arbitrary<WorktreeLayoutCase> {
  return fc
    .record({ name: arbitraryPathSegment(), branch: fc.option(arbitraryBranchName(), { nil: undefined }) })
    .filter(({ branch }) => branch !== SEED_BRANCH)
    .map(({ name, branch }) => ({
      spec: { bare: false, worktrees: [{ name, branch }] },
      mainCheckoutName: name,
      otherNames: [],
    }));
}

/**
 * A non-bare repository with a linked worktree: the main working tree is the main
 * checkout and the linked worktree is not — bareness, not directory shape, decides.
 */
export function arbitraryNonBareLinkedLayoutCase(): fc.Arbitrary<WorktreeLayoutCase> {
  return fc
    .record({
      mainName: arbitraryPathSegment(),
      linkedName: arbitraryPathSegment(),
      linkedBranch: arbitraryBranchName(),
    })
    .filter(({ mainName, linkedName, linkedBranch }) => mainName !== linkedName && linkedBranch !== SEED_BRANCH)
    .map(({ mainName, linkedName, linkedBranch }) => ({
      spec: { bare: false, worktrees: [{ name: mainName }, { name: linkedName, branch: linkedBranch }] },
      mainCheckoutName: mainName,
      otherNames: [linkedName],
    }));
}

/**
 * A bare-repository pool: the worktree named after the `origin` repository is the
 * main checkout, and a differently-named feature worktree is not.
 */
export function arbitraryBarePoolLayoutCase(): fc.Arbitrary<WorktreeLayoutCase> {
  return fc
    .record({
      repoName: arbitraryRepositoryName(),
      bareName: arbitraryPathSegment(),
      featureName: arbitraryPathSegment(),
      featureBranch: arbitraryBranchName(),
    })
    .filter(({ repoName, featureName, featureBranch }) => featureName !== repoName && featureBranch !== SEED_BRANCH)
    .chain((parts) =>
      arbitraryOriginUrl(parts.repoName).map((origin) => ({
        spec: {
          bare: true,
          bareName: parts.bareName,
          origin,
          worktrees: [
            { name: parts.repoName },
            { name: parts.featureName, branch: parts.featureBranch },
          ],
        },
        mainCheckoutName: parts.repoName,
        otherNames: [parts.featureName],
      }))
    );
}

/**
 * A bare-repository pool without an `origin` remote: every worktree is non-main
 * and `mainCheckoutPath` resolves no path because no repository name exists.
 */
export function arbitraryBarePoolWithoutOriginLayoutCase(): fc.Arbitrary<BarePoolWithoutOriginLayoutCase> {
  return fc
    .record({
      bareName: arbitraryPathSegment(),
      featureName: arbitraryPathSegment(),
    })
    .map(({ bareName, featureName }) => ({
      spec: {
        bare: true,
        bareName,
        worktrees: [{ name: featureName }],
      },
      nonMainCheckoutName: featureName,
    }));
}

/**
 * A bare-repository pool with an `origin` remote but no worktree named after the
 * origin repository: every existing worktree is non-main and no main-checkout
 * path is designable.
 */
export function arbitraryBarePoolWithoutMainCheckoutLayoutCase(): fc.Arbitrary<BarePoolWithoutMainCheckoutLayoutCase> {
  return fc
    .record({
      repoName: arbitraryRepositoryName(),
      bareName: arbitraryPathSegment(),
      featureName: arbitraryPathSegment(),
    })
    .filter(({ repoName, featureName }) => repoName !== featureName)
    .chain((parts) =>
      arbitraryOriginUrl(parts.repoName).map((origin) => ({
        spec: {
          bare: true,
          bareName: parts.bareName,
          origin,
          worktrees: [{ name: parts.featureName }],
        },
        nonMainCheckoutName: parts.featureName,
      }))
    );
}
