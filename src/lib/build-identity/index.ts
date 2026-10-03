/**
 * The build identity an spx build carries: the package version, extended with SemVer build
 * metadata naming the commit and any uncommitted tracked changes for every build that is not a
 * release.
 *
 * The identity is computed once, when `dist/` is built, from the git state of the checkout being
 * built; the executable only reports the value stamped into it.
 */
import { RELEASE_TAG_PREFIX } from "@/lib/git/release";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";

/** The tokens a build identity is composed from. */
export const BUILD_IDENTITY_FORMAT = {
  /** Separates the package version from SemVer build metadata. */
  METADATA_SEPARATOR: "+",
  /** Number of leading hexadecimal digits of the commit SHA the metadata carries. */
  COMMIT_ABBREVIATION_LENGTH: 9,
  /** Appended to the commit metadata when tracked files differ from the commit. */
  DIRTY_SUFFIX: ".dirty",
  /** The metadata of a build made outside a Git checkout. */
  UNKNOWN_METADATA: "unknown",
} as const;

/** The global identifier the build replaces with the stamped build identity. */
export const BUILD_IDENTITY_DEFINE_KEY = "__SPX_BUILD_IDENTITY__";

/** Git state of the directory a build runs in. */
export type BuildCheckoutObservation =
  | { readonly insideCheckout: false }
  | {
    readonly insideCheckout: true;
    /** Full SHA of the checked-out commit. */
    readonly commit: string;
    /** Tags pointing at the checked-out commit. */
    readonly tags: readonly string[];
    /** Whether any tracked file differs from the commit. */
    readonly trackedChanges: boolean;
  };

const GIT_BUILD_COMMAND = {
  STATUS: "status",
  PORCELAIN: "--porcelain",
  NO_UNTRACKED_FILES: "--untracked-files=no",
  TAG: "tag",
  POINTS_AT: "--points-at",
} as const;

const GIT_SUCCESS_EXIT_CODE = 0;
const LINE_SEPARATOR = "\n";

/** The identity of a build whose git state is unknown, such as a build outside a Git checkout. */
export function unknownBuildIdentity(packageVersion: string): string {
  return `${packageVersion}${BUILD_IDENTITY_FORMAT.METADATA_SEPARATOR}${BUILD_IDENTITY_FORMAT.UNKNOWN_METADATA}`;
}

/**
 * The build identity for `packageVersion` built from `observation`: the bare package version for a
 * clean commit tagged `v<packageVersion>`; otherwise the version with the commit abbreviation as
 * build metadata, suffixed `.dirty` when tracked files changed; and the unknown identity outside a
 * checkout.
 */
export function formatBuildIdentity(packageVersion: string, observation: BuildCheckoutObservation): string {
  if (!observation.insideCheckout) {
    return unknownBuildIdentity(packageVersion);
  }
  const releaseTag = `${RELEASE_TAG_PREFIX}${packageVersion}`;
  if (!observation.trackedChanges && observation.tags.includes(releaseTag)) {
    return packageVersion;
  }
  const commitMetadata = observation.commit.slice(0, BUILD_IDENTITY_FORMAT.COMMIT_ABBREVIATION_LENGTH);
  const dirtySuffix = observation.trackedChanges ? BUILD_IDENTITY_FORMAT.DIRTY_SUFFIX : "";
  return `${packageVersion}${BUILD_IDENTITY_FORMAT.METADATA_SEPARATOR}${commitMetadata}${dirtySuffix}`;
}

/** Reads the git state of `dir` through the injected git runner. */
export async function observeBuildCheckout(dir: string, deps: GitDependencies): Promise<BuildCheckoutObservation> {
  const head = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.VERIFY, GIT_ROOT_COMMAND.HEAD],
    { cwd: dir, reject: false },
  );
  if (head.exitCode !== GIT_SUCCESS_EXIT_CODE) {
    return { insideCheckout: false };
  }
  const tags = await runRequiredGit(
    dir,
    [GIT_BUILD_COMMAND.TAG, GIT_BUILD_COMMAND.POINTS_AT, GIT_ROOT_COMMAND.HEAD],
    deps,
  );
  const status = await runRequiredGit(
    dir,
    [GIT_BUILD_COMMAND.STATUS, GIT_BUILD_COMMAND.PORCELAIN, GIT_BUILD_COMMAND.NO_UNTRACKED_FILES],
    deps,
  );
  return {
    insideCheckout: true,
    commit: head.stdout.trim(),
    tags: nonEmptyLines(tags),
    trackedChanges: nonEmptyLines(status).length > 0,
  };
}

/** The build identity of `packageVersion` built from the checkout at `dir`. */
export async function readBuildIdentity(packageVersion: string, dir: string, deps: GitDependencies): Promise<string> {
  return formatBuildIdentity(packageVersion, await observeBuildCheckout(dir, deps));
}

async function runRequiredGit(dir: string, args: string[], deps: GitDependencies): Promise<string> {
  const result = await deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, args, { cwd: dir, reject: false });
  if (result.exitCode !== GIT_SUCCESS_EXIT_CODE) {
    throw new Error(
      `git ${args.join(" ")} failed in ${dir} with exit code ${result.exitCode}: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function nonEmptyLines(output: string): string[] {
  return output.split(LINE_SEPARATOR).map((line) => line.trim()).filter((line) => line.length > 0);
}
