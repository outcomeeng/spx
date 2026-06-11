import * as fc from "fast-check";

import type { GitFacts } from "@/git/root";
import type { BarePoolSpec } from "@testing/harnesses/bare-pool/bare-pool";

const PATH_SEGMENT_PATTERN = /^[a-z][a-z0-9-]{2,12}$/;
const POSIX_SEPARATOR = "/";
const BARE_REPO_SUFFIX = ".git";
const GIT_DIR_NAME = ".git";
const HTTPS_SCHEME = "https://";
const SCP_USER = "git@";
const HOST_TLD = ".com";
const SCP_PATH_SEPARATOR = ":";

/** The `origin` URL forms git accepts, each carrying the repository name as its final segment. */
const ORIGIN_URL_FORM = {
  HTTPS: "https",
  HTTPS_NO_SUFFIX: "https-no-suffix",
  SCP: "scp",
  LOCAL_PATH: "local-path",
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
      ),
    })
    .map(({ host, owner, form }) => {
      const ownerSlashRepo = `${owner}${POSIX_SEPARATOR}${repoName}`;
      switch (form) {
        case ORIGIN_URL_FORM.HTTPS:
          return `${HTTPS_SCHEME}${host}${HOST_TLD}${POSIX_SEPARATOR}${ownerSlashRepo}${BARE_REPO_SUFFIX}`;
        case ORIGIN_URL_FORM.HTTPS_NO_SUFFIX:
          return `${HTTPS_SCHEME}${host}${HOST_TLD}${POSIX_SEPARATOR}${ownerSlashRepo}`;
        case ORIGIN_URL_FORM.SCP:
          return `${SCP_USER}${host}${HOST_TLD}${SCP_PATH_SEPARATOR}${ownerSlashRepo}${BARE_REPO_SUFFIX}`;
        default:
          return `${POSIX_SEPARATOR}${ownerSlashRepo}${BARE_REPO_SUFFIX}`;
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
    .filter(({ repoName, otherBasename }) => otherBasename !== repoName)
    .chain((parts) =>
      arbitraryOriginUrl(parts.repoName).map((originUrl) => {
        const container = `${POSIX_SEPARATOR}${parts.containerParent}${POSIX_SEPARATOR}${parts.containerName}`;
        const commonDir = `${container}${POSIX_SEPARATOR}${parts.bareRepoName}${BARE_REPO_SUFFIX}`;
        const worktreeRoot = `${container}${POSIX_SEPARATOR}${parts.repoName}`;
        const mainCheckout: GitFacts = { worktreeRoot, commonDir, commonDirIsBare: true, originUrl };
        return {
          mainCheckout,
          basenameMismatch: {
            ...mainCheckout,
            worktreeRoot: `${container}${POSIX_SEPARATOR}${parts.otherBasename}`,
          },
          siblingMismatch: {
            ...mainCheckout,
            commonDir:
              `${POSIX_SEPARATOR}${parts.otherContainerName}${POSIX_SEPARATOR}${parts.bareRepoName}${BARE_REPO_SUFFIX}`,
          },
          originUnset: { ...mainCheckout, originUrl: null },
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
      const commonDir = `${worktreeRoot}${POSIX_SEPARATOR}${GIT_DIR_NAME}`;
      return {
        facts: { worktreeRoot, commonDir, commonDirIsBare: false, originUrl },
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
        const commonDir = `${mainTree}${POSIX_SEPARATOR}${GIT_DIR_NAME}`;
        const worktreeRoot = `${mainTree}${POSIX_SEPARATOR}${parts.linkedDir}`;
        return {
          facts: { worktreeRoot, commonDir, commonDirIsBare: false, originUrl },
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
    })
    .chain((parts) =>
      arbitraryOriginUrl(parts.repoName).map((originUrl) => {
        const container = `${POSIX_SEPARATOR}${parts.containerParent}${POSIX_SEPARATOR}${parts.containerName}`;
        const commonDir = `${container}${POSIX_SEPARATOR}${parts.bareRepoName}${BARE_REPO_SUFFIX}`;
        const worktreeRoot = `${container}${POSIX_SEPARATOR}${parts.worktreeDir}`;
        return {
          facts: {
            worktreeRoot,
            commonDir,
            commonDirIsBare: true,
            originUrl: parts.hasOrigin ? originUrl : null,
          },
          expectedPath: parts.hasOrigin ? `${container}${POSIX_SEPARATOR}${parts.repoName}` : null,
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
 * Inputs for a real bare-repository pool: a feature worktree whose directory
 * differs from the `origin` repository name (so it is not the main checkout),
 * and an `origin` URL whose repository name equals the main checkout's directory.
 */
export function arbitraryBarePoolSpec(): fc.Arbitrary<BarePoolSpec> {
  return fc
    .record({
      repoName: arbitraryRepositoryName(),
      bareName: arbitraryPathSegment(),
      featureDir: arbitraryPathSegment(),
      featureBranch: arbitraryBranchName(),
    })
    .filter(({ repoName, featureDir }) => featureDir !== repoName)
    .chain((parts) => arbitraryOriginUrl(parts.repoName).map((originUrl) => ({ ...parts, originUrl })));
}
