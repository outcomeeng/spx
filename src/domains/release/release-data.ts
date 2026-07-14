import {
  changedPathsBetween,
  closestReleaseTag,
  commitsBetween,
  type GitCommit,
  RELEASE_TAG_PREFIX,
  releaseTagsAt,
} from "@/lib/git/release";
import { defaultGitDependencies, GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";

/** The semantic-version component a release advances relative to its previous tag. */
export const VERSION_DELTA = {
  MAJOR: "major",
  MINOR: "minor",
  PATCH: "patch",
} as const;

export type VersionDelta = (typeof VERSION_DELTA)[keyof typeof VERSION_DELTA];

/**
 * The deterministic description a release derives from git history — the package
 * version, the commits since the previous release tag, the version delta, and the
 * changed paths. Release notes, documentation sync, and publish dispatch all read
 * this contract.
 */
export interface ReleaseData {
  /** The product's package version this release publishes, the one version downstream children read. */
  readonly version: string;
  /** The release tag the delta anchors on, or null when no prior release tag exists. */
  readonly previousTag: string | null;
  /** The commits since the previous release tag, or the full history when none exists. */
  readonly commits: readonly GitCommit[];
  /** The version delta against the previous tag, or null when no prior release tag exists. */
  readonly versionDelta: VersionDelta | null;
  /** The paths changed since the previous release tag. */
  readonly changedPaths: readonly string[];
}

export interface ComputeReleaseDataOptions {
  /** The product working tree the release is computed from. */
  readonly productDir: string;
  /** The product's package version, resolved from the product working tree. */
  readonly packageVersion: string;
  /** The injected git runner; defaults to the sanitized-environment runner. */
  readonly deps?: GitDependencies;
}

const SEMVER_SEPARATOR = ".";
const SEMVER_RADIX = 10;
const ABSENT_COMPONENT = 0;

interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * Classifies the version delta between a previous release tag and a package
 * version as major, minor, or patch — the most significant differing semantic
 * version component.
 *
 * @remarks Defined only for a package version that advances beyond the previous
 * tag. For equal versions the return value is unspecified — re-releasing the
 * same version is governed by publish dispatch's precondition, and callers must
 * not rely on the delta until that decision lands.
 */
export function classifyVersionDelta(previousTag: string, packageVersion: string): VersionDelta {
  const previous = parseSemver(releaseVersionFromTag(previousTag));
  const current = parseSemver(packageVersion);
  if (previous.major !== current.major) return VERSION_DELTA.MAJOR;
  if (previous.minor !== current.minor) return VERSION_DELTA.MINOR;
  return VERSION_DELTA.PATCH;
}

/**
 * Computes the release data for the release at HEAD of `productDir` — the package
 * version, the commits since the previous release tag, the version delta, and the
 * changed paths. Deterministic given the repository state and inputs; all git
 * access flows through the injected runner.
 */
export async function computeReleaseData(options: ComputeReleaseDataOptions): Promise<ReleaseData> {
  const { productDir, packageVersion, deps = defaultGitDependencies } = options;

  const previousTag = await resolvePreviousReleaseTag(productDir, deps);
  const commits = await commitsBetween(previousTag, GIT_ROOT_COMMAND.HEAD, productDir, deps);
  const changedPaths = await changedPathsBetween(previousTag, GIT_ROOT_COMMAND.HEAD, productDir, deps);
  const versionDelta = previousTag === null ? null : classifyVersionDelta(previousTag, packageVersion);

  return { version: packageVersion, previousTag, commits, versionDelta, changedPaths };
}

/**
 * Selects the release tag a release at HEAD anchors on — the closest release tag
 * reachable from HEAD that does not point at HEAD itself, so tags created on the
 * release commit anchor the delta on the prior tag rather than on themselves.
 * Every release tag at HEAD is excluded, so a commit carrying more than one (a
 * retried publish) still anchors on the prior commit's tag. Returns null when no
 * prior release tag is reachable, including an empty repository.
 */
async function resolvePreviousReleaseTag(
  productDir: string,
  deps: GitDependencies,
): Promise<string | null> {
  const tagsAtHead = await releaseTagsAt(GIT_ROOT_COMMAND.HEAD, productDir, deps);
  return closestReleaseTag(GIT_ROOT_COMMAND.HEAD, tagsAtHead, productDir, deps);
}

export function releaseVersionFromTag(tag: string): string {
  return tag.startsWith(RELEASE_TAG_PREFIX) ? tag.slice(RELEASE_TAG_PREFIX.length) : tag;
}

function parseSemver(version: string): SemverParts {
  const [major, minor, patch] = version.split(SEMVER_SEPARATOR);
  return {
    major: toComponent(major),
    minor: toComponent(minor),
    patch: toComponent(patch),
  };
}

function toComponent(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", SEMVER_RADIX);
  return Number.isNaN(parsed) ? ABSENT_COMPONENT : parsed;
}
