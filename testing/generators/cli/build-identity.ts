/**
 * The finite build-state domain the build identity maps over, and the package versions it is
 * computed for.
 *
 * A build is either outside any Git checkout or inside one; inside one, the commit carries the
 * release tag for the package version, carries only some other release tag, or carries none, and
 * the tracked files are either clean or modified. Every combination is a distinct build state the
 * mapping must assign an identity to, so the domain is their complete product rather than a
 * hand-picked sample.
 */
import * as fc from "fast-check";

import { RELEASE_TEST_GENERATOR } from "@testing/generators/release/release";
import { sampleGeneratedValue } from "@testing/generators/sample";

/** How the built commit relates to the release tag for the package version. */
export const BUILD_COMMIT_TAG_RELATION = {
  /** The commit carries the tag `v<package version>`. */
  RELEASE_TAG: "release-tag",
  /** The commit carries a release tag for some other version only. */
  OTHER_RELEASE_TAG: "other-release-tag",
  /** The commit carries no tag. */
  UNTAGGED: "untagged",
} as const;

export type BuildCommitTagRelation = (typeof BUILD_COMMIT_TAG_RELATION)[keyof typeof BUILD_COMMIT_TAG_RELATION];

/** Whether the build's tracked files match the commit. */
export const BUILD_WORKING_TREE_STATE = {
  CLEAN: "clean",
  MODIFIED: "modified",
} as const;

export type BuildWorkingTreeState = (typeof BUILD_WORKING_TREE_STATE)[keyof typeof BUILD_WORKING_TREE_STATE];

/** One build state: a directory outside any Git checkout, or a checkout in one tag relation and working-tree state. */
export type BuildState =
  | { readonly insideCheckout: false }
  | {
    readonly insideCheckout: true;
    readonly tagRelation: BuildCommitTagRelation;
    readonly workingTree: BuildWorkingTreeState;
  };

/** The package version and the distinct version another release tag names. */
export interface BuildVersions {
  readonly packageVersion: string;
  readonly otherVersion: string;
}

/** Every build state: outside a checkout, plus each tag relation crossed with each working-tree state. */
export function buildStates(): readonly BuildState[] {
  const checkoutStates = Object.values(BUILD_COMMIT_TAG_RELATION).flatMap((tagRelation) =>
    Object.values(BUILD_WORKING_TREE_STATE).map((workingTree): BuildState => ({
      insideCheckout: true,
      tagRelation,
      workingTree,
    }))
  );
  return [{ insideCheckout: false }, ...checkoutStates];
}

/** A package version and a second, distinct version for an unrelated release tag. */
export function arbitraryBuildVersions(): fc.Arbitrary<BuildVersions> {
  return RELEASE_TEST_GENERATOR.semver().chain((packageVersion) =>
    RELEASE_TEST_GENERATOR.distinctSemverFrom(packageVersion).map((otherVersion) => ({
      packageVersion,
      otherVersion,
    }))
  );
}

/** One deterministic draw of the package and other-release versions. */
export function sampleBuildVersions(): BuildVersions {
  return sampleGeneratedValue(arbitraryBuildVersions());
}

/** A readable label for a build state, used in test titles. */
export function describeBuildState(state: BuildState): string {
  return state.insideCheckout
    ? `${state.tagRelation} commit, ${state.workingTree} tracked files`
    : "outside a checkout";
}
