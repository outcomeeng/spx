import {
  changedPathsBetween,
  closestReleaseTag,
  COMMIT_LOG_FORMAT,
  commitsBetween,
  EMPTY_LOG_FORMAT,
  GIT_RELEASE_FLAG,
  GIT_RELEASE_SUBCOMMAND,
  type GitCommit,
  RELEASE_TAG_GLOB,
  RELEASE_TAG_PREFIX,
  releaseTagsAt,
} from "@/lib/git/release";
import { defaultGitDependencies, GIT_ROOT_COMMAND, type GitDependencies, resolveRefSha } from "@/lib/git/root";

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
  /** The full commit identity whose release contents were computed. */
  readonly releaseRef: string;
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
  /** The commit or tag whose release contents are computed; defaults to `HEAD`. */
  readonly releaseRef?: string;
  /** The injected git runner; defaults to the sanitized-environment runner. */
  readonly deps?: GitDependencies;
}

const SEMVER_SEPARATOR = ".";
const SEMVER_RADIX = 10;
const ABSENT_COMPONENT = 0;

class ReleaseDataExternalOperationError extends Error {
  public constructor(
    public readonly command: string,
    public readonly subcommand: string | undefined,
  ) {
    super(`Release-data computation rejected external operation: ${command} ${subcommand ?? ""}`.trim());
    this.name = "ReleaseDataExternalOperationError";
  }
}

export function restrictReleaseDataGitDependencies(deps: GitDependencies, productDir: string): GitDependencies {
  return {
    execa: async (command, args, options) => {
      const subcommand = args.at(0);
      if (
        command !== GIT_ROOT_COMMAND.EXECUTABLE
        || subcommand === undefined
        || !isReleaseDataGitOperation(args, options, productDir)
      ) {
        throw new ReleaseDataExternalOperationError(command, subcommand);
      }
      return deps.execa(command, args, options);
    },
  };
}

function isReleaseDataGitOperation(
  args: readonly string[],
  options: Parameters<GitDependencies["execa"]>[2],
  productDir: string,
): boolean {
  if (matchesResolveRef(args)) return hasExactGitOptions(options, productDir, false);
  if (matchesReleaseTagsAt(args)) return hasExactGitOptions(options, productDir, false);
  if (matchesClosestReleaseTag(args)) return hasExactGitOptions(options, productDir, false);
  if (matchesCommitListing(args)) return hasExactGitOptions(options, productDir, true);
  if (matchesChangedPathListing(args)) return hasExactGitOptions(options, productDir, false);
  return false;
}

function matchesResolveRef(args: readonly string[]): boolean {
  return args.length === 2
    && args[0] === GIT_ROOT_COMMAND.REV_PARSE
    && isSafeGitOperand(args[1]);
}

function matchesReleaseTagsAt(args: readonly string[]): boolean {
  return args.length === 5
    && args[0] === GIT_RELEASE_SUBCOMMAND.TAG
    && args[1] === GIT_RELEASE_FLAG.POINTS_AT
    && isSafeGitOperand(args[2])
    && args[3] === GIT_RELEASE_FLAG.LIST
    && args[4] === RELEASE_TAG_GLOB;
}

function matchesClosestReleaseTag(args: readonly string[]): boolean {
  const prefix = [
    GIT_RELEASE_SUBCOMMAND.DESCRIBE,
    GIT_RELEASE_FLAG.TAGS,
    GIT_RELEASE_FLAG.ABBREV_ZERO,
    GIT_RELEASE_FLAG.MATCH,
    RELEASE_TAG_GLOB,
  ] as const;
  if (args.length < prefix.length + 1 || !prefix.every((value, index) => args[index] === value)) return false;

  const ref = args.at(-1);
  if (!isSafeGitOperand(ref)) return false;

  const exclusions = args.slice(prefix.length, -1);
  if (exclusions.length % 2 !== 0) return false;
  for (let index = 0; index < exclusions.length; index += 2) {
    if (exclusions[index] !== GIT_RELEASE_FLAG.EXCLUDE || !isSafeGitOperand(exclusions[index + 1])) return false;
  }
  return true;
}

function matchesCommitListing(args: readonly string[]): boolean {
  return args.length === 4
    && args[0] === GIT_RELEASE_SUBCOMMAND.LOG
    && args[1] === GIT_RELEASE_FLAG.NULL_TERMINATED
    && args[2] === COMMIT_LOG_FORMAT
    && isSafeGitOperand(args[3]);
}

function matchesChangedPathListing(args: readonly string[]): boolean {
  return args.length === 5
    && args[0] === GIT_RELEASE_SUBCOMMAND.LOG
    && args[1] === GIT_RELEASE_FLAG.DIFF_MERGES_FIRST_PARENT
    && args[2] === EMPTY_LOG_FORMAT
    && args[3] === GIT_RELEASE_FLAG.NAME_ONLY
    && isSafeGitOperand(args[4]);
}

function isSafeGitOperand(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && !value.startsWith("-");
}

function hasExactGitOptions(
  options: Parameters<GitDependencies["execa"]>[2],
  productDir: string,
  stripsFinalNewline: boolean,
): boolean {
  if (options === undefined) return false;
  const keys = Object.keys(options);
  const expectedKeyCount = stripsFinalNewline ? 3 : 2;
  return keys.length === expectedKeyCount
    && keys.every((key) => key === "cwd" || key === "reject" || (stripsFinalNewline && key === "stripFinalNewline"))
    && options.cwd === productDir
    && options.reject === false
    && (stripsFinalNewline ? options.stripFinalNewline === false : options.stripFinalNewline === undefined);
}

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
 * not rely on the delta for equal versions.
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
  const {
    productDir,
    packageVersion,
    releaseRef = GIT_ROOT_COMMAND.HEAD,
    deps = defaultGitDependencies,
  } = options;

  const releaseDataDeps = restrictReleaseDataGitDependencies(deps, productDir);
  const resolvedReleaseRef = await resolveRefSha(releaseRef, productDir, releaseDataDeps);
  if (resolvedReleaseRef === null) throw new Error(`Cannot resolve release ref: ${releaseRef}`);
  const previousTag = await resolvePreviousReleaseTag(resolvedReleaseRef, productDir, releaseDataDeps);
  const commits = await commitsBetween(previousTag, resolvedReleaseRef, productDir, releaseDataDeps);
  const changedPaths = await changedPathsBetween(previousTag, resolvedReleaseRef, productDir, releaseDataDeps);
  const versionDelta = previousTag === null ? null : classifyVersionDelta(previousTag, packageVersion);

  return { version: packageVersion, releaseRef: resolvedReleaseRef, previousTag, commits, versionDelta, changedPaths };
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
  releaseRef: string,
  productDir: string,
  deps: GitDependencies,
): Promise<string | null> {
  const tagsAtRelease = await releaseTagsAt(releaseRef, productDir, deps);
  return closestReleaseTag(releaseRef, tagsAtRelease, productDir, deps);
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
