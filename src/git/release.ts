import { defaultGitDependencies, GIT_ROOT_COMMAND, type GitDependencies } from "./root";

/** A commit on the release range — its full SHA and its subject line. */
export interface GitCommit {
  /** Full commit SHA. */
  readonly sha: string;
  /** Commit subject (first line of the message). */
  readonly subject: string;
}

const GIT_RELEASE_SUBCOMMAND = {
  DESCRIBE: "describe",
  LOG: "log",
  TAG: "tag",
} as const;

const GIT_RELEASE_FLAG = {
  TAGS: "--tags",
  ABBREV_ZERO: "--abbrev=0",
  MATCH: "--match",
  EXCLUDE: "--exclude",
  NAME_ONLY: "--name-only",
  POINTS_AT: "--points-at",
  LIST: "--list",
} as const;

/** The prefix publication puts on a release tag (`v1.2.3`). The single source the release domain and its test generator import so the prefix, the strip, and the glob never drift. */
export const RELEASE_TAG_PREFIX = "v";
/** Glob matching the release tags publication produces, derived from the prefix. */
const RELEASE_TAG_GLOB = `${RELEASE_TAG_PREFIX}*`;
/** Two-dot range listing commits reachable from the right side but not the left. */
const RANGE_SEPARATOR = "..";
/** The unit-separator byte (U+001F) git emits between a commit's SHA and subject. */
const UNIT_SEPARATOR_CODE = 0x1f;
const COMMIT_FIELD_SEPARATOR = String.fromCodePoint(UNIT_SEPARATOR_CODE);
/** Git pretty-format escape directing git to emit the unit-separator byte. */
const GIT_FORMAT_UNIT_SEPARATOR = "%x1f";
const COMMIT_LOG_FORMAT = `--format=%H${GIT_FORMAT_UNIT_SEPARATOR}%s`;
/** Empty pretty-format, so `git log --name-only` emits only the changed paths. */
const EMPTY_LOG_FORMAT = "--format=";
const LINE_SEPARATOR = "\n";

function nonEmptyLines(stdout: string): string[] {
  return stdout.split(LINE_SEPARATOR).filter((line) => line.length > 0);
}

/** The `git log` range for a tag pair: full history from `toRef` when `fromTag` is null, else `fromTag..toRef`. */
function logRange(fromTag: string | null, toRef: string): string {
  return fromTag === null ? toRef : `${fromTag}${RANGE_SEPARATOR}${toRef}`;
}

/**
 * Returns the closest release tag reachable from `ref`, excluding any tag names
 * in `excluded`. Reports git's describe result for the given ref and excludes;
 * it holds no notion of which tag a release anchors on. Returns null when no
 * matching release tag is reachable.
 */
export async function closestReleaseTag(
  ref: string,
  excluded: readonly string[],
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const excludeArgs = excluded.flatMap((tag) => [GIT_RELEASE_FLAG.EXCLUDE, tag]);
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      GIT_RELEASE_SUBCOMMAND.DESCRIBE,
      GIT_RELEASE_FLAG.TAGS,
      GIT_RELEASE_FLAG.ABBREV_ZERO,
      GIT_RELEASE_FLAG.MATCH,
      RELEASE_TAG_GLOB,
      ...excludeArgs,
      ref,
    ],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const tag = result.stdout.trim();
  return tag.length === 0 ? null : tag;
}

/**
 * Lists the release tags that point at `ref`. Reports what git reports for the
 * ref; it holds no notion of which tag a release anchors on. A commit can carry
 * more than one release tag (a retried publish), so the result is a set.
 */
export async function releaseTagsAt(
  ref: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<string[]> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_RELEASE_SUBCOMMAND.TAG, GIT_RELEASE_FLAG.POINTS_AT, ref, GIT_RELEASE_FLAG.LIST, RELEASE_TAG_GLOB],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return [];
  return nonEmptyLines(result.stdout);
}

/**
 * Lists the commits between `fromTag` (exclusive) and `toRef` (inclusive). When
 * `fromTag` is null the full history reachable from `toRef` is returned.
 */
export async function commitsBetween(
  fromTag: string | null,
  toRef: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<GitCommit[]> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_RELEASE_SUBCOMMAND.LOG, COMMIT_LOG_FORMAT, logRange(fromTag, toRef)],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return [];
  return nonEmptyLines(result.stdout).map(parseCommitRecord);
}

function parseCommitRecord(line: string): GitCommit {
  const separatorIndex = line.indexOf(COMMIT_FIELD_SEPARATOR);
  if (separatorIndex === -1) {
    return { sha: line, subject: "" };
  }
  return {
    sha: line.slice(0, separatorIndex),
    subject: line.slice(separatorIndex + COMMIT_FIELD_SEPARATOR.length),
  };
}

/**
 * Lists the distinct paths touched by the commits between `fromTag` (exclusive)
 * and `toRef` (inclusive), or across the full history reachable from `toRef` when
 * `fromTag` is null. Shares `logRange` with `commitsBetween`, so the changed paths
 * and the commits are drawn from one commit set.
 */
export async function changedPathsBetween(
  fromTag: string | null,
  toRef: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<string[]> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_RELEASE_SUBCOMMAND.LOG, EMPTY_LOG_FORMAT, GIT_RELEASE_FLAG.NAME_ONLY, logRange(fromTag, toRef)],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return [];
  return Array.from(new Set(nonEmptyLines(result.stdout)));
}
