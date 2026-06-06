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
  DIFF: "diff",
  LS_FILES: "ls-files",
} as const;

const GIT_RELEASE_FLAG = {
  TAGS: "--tags",
  ABBREV_ZERO: "--abbrev=0",
  MATCH: "--match",
  EXCLUDE: "--exclude",
  NAME_ONLY: "--name-only",
} as const;

/** Glob matching the `v`-prefixed release tags publication produces. */
const RELEASE_TAG_GLOB = "v*";
/** Peels a ref to its commit object, dereferencing annotated tags. */
const COMMIT_PEEL_SUFFIX = "^{commit}";
/** Two-dot range listing commits reachable from the right side but not the left. */
const RANGE_SEPARATOR = "..";
/** The unit-separator byte (U+001F) git emits between a commit's SHA and subject. */
const UNIT_SEPARATOR_CODE = 0x1f;
const COMMIT_FIELD_SEPARATOR = String.fromCharCode(UNIT_SEPARATOR_CODE);
/** Git pretty-format escape directing git to emit the unit-separator byte. */
const GIT_FORMAT_UNIT_SEPARATOR = "%x1f";
const COMMIT_LOG_FORMAT = `--format=%H${GIT_FORMAT_UNIT_SEPARATOR}%s`;
const LINE_SEPARATOR = "\n";

function nonEmptyLines(stdout: string): string[] {
  return stdout.split(LINE_SEPARATOR).filter((line) => line.length > 0);
}

/**
 * Resolves the commit object `ref` points at, dereferencing annotated tags.
 * Returns null when the ref cannot be resolved.
 */
export async function resolveCommitSha(
  ref: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_ROOT_COMMAND.REV_PARSE, `${ref}${COMMIT_PEEL_SUFFIX}`],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const sha = result.stdout.trim();
  return sha.length === 0 ? null : sha;
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
 * Lists the commits between `fromTag` (exclusive) and `toRef` (inclusive). When
 * `fromTag` is null the full history reachable from `toRef` is returned.
 */
export async function commitsBetween(
  fromTag: string | null,
  toRef: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<GitCommit[]> {
  const range = fromTag === null ? toRef : `${fromTag}${RANGE_SEPARATOR}${toRef}`;
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_RELEASE_SUBCOMMAND.LOG, COMMIT_LOG_FORMAT, range],
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
 * Lists the paths changed between `fromTag` and `toRef`. When `fromTag` is null
 * the full set of tracked paths is returned — with no prior release, the whole
 * tree is the release's contents.
 */
export async function changedPathsBetween(
  fromTag: string | null,
  toRef: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<string[]> {
  const result = fromTag === null
    ? await deps.execa(GIT_ROOT_COMMAND.EXECUTABLE, [GIT_RELEASE_SUBCOMMAND.LS_FILES], {
      cwd,
      reject: false,
    })
    : await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [GIT_RELEASE_SUBCOMMAND.DIFF, GIT_RELEASE_FLAG.NAME_ONLY, fromTag, toRef],
      { cwd, reject: false },
    );
  if (result.exitCode !== 0) return [];
  return nonEmptyLines(result.stdout);
}
