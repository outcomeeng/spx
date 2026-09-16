import { defaultGitDependencies, GIT_ROOT_COMMAND, type GitDependencies } from "./root";

/** A commit on the release range — its full SHA, subject, and message body. */
export interface GitCommit {
  /** Full commit SHA. */
  readonly sha: string;
  /** Commit subject (first line of the message). */
  readonly subject: string;
  /** Remaining commit message, including paragraph boundaries. */
  readonly body: string;
}

const GIT_RELEASE_SUBCOMMAND = {
  CAT_FILE: "cat-file",
  DESCRIBE: "describe",
  LS_TREE: "ls-tree",
  LOG: "log",
  TAG: "tag",
} as const;

/** The object type `git cat-file` is asked for, so a tree or commit at the path fails rather than printing a listing. */
const GIT_BLOB_OBJECT_TYPE = "blob";
/** Separator between a revision and a tree path in a `<rev>:<path>` object name. */
const REVISION_PATH_SEPARATOR = ":";
/** Prefix that makes a `<rev>:<path>` object name resolve the path relative to the working directory rather than the repository root. */
const CWD_RELATIVE_TREE_PATH_PREFIX = "./";

const GIT_RELEASE_FLAG = {
  TAGS: "--tags",
  ABBREV_ZERO: "--abbrev=0",
  MATCH: "--match",
  EXCLUDE: "--exclude",
  DIFF_MERGES_FIRST_PARENT: "--diff-merges=first-parent",
  NAME_ONLY: "--name-only",
  POINTS_AT: "--points-at",
  LIST: "--list",
  NULL_TERMINATED: "-z",
  RECURSIVE: "-r",
} as const;

/** The prefix publication puts on a release tag (`v1.2.3`). The single source the release domain and its test generator import so the prefix, the strip, and the glob never drift. */
export const RELEASE_TAG_PREFIX = "v";
/** Glob matching the release tags publication produces, derived from the prefix. */
const RELEASE_TAG_GLOB = `${RELEASE_TAG_PREFIX}*`;
/** Two-dot range listing commits reachable from the right side but not the left. */
const RANGE_SEPARATOR = "..";
const COMMIT_FIELD_SEPARATOR = "\0";
const COMMIT_FIELD_COUNT = 3;
const COMMIT_LOG_FORMAT = "--format=%H%x00%s%x00%b";
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
 * Reads the content of the file at `treePath` — relative to `cwd`, forward-slash
 * separated — as committed at `ref`, keeping the blob's bytes including its
 * final newline. Returns null when the ref does not resolve or its tree holds
 * no blob at the path: a directory there is not a file, so it reads as absent.
 */
export async function committedFileContent(
  ref: string,
  treePath: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<string | null> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      GIT_RELEASE_SUBCOMMAND.CAT_FILE,
      GIT_BLOB_OBJECT_TYPE,
      `${ref}${REVISION_PATH_SEPARATOR}${CWD_RELATIVE_TREE_PATH_PREFIX}${treePath}`,
    ],
    { cwd, reject: false, stripFinalNewline: false },
  );
  if (result.exitCode !== 0) return null;
  return result.stdout;
}

/** Lists every path committed at `ref`, relative to `cwd`, in git's stable tree order. */
export async function committedPaths(
  ref: string,
  cwd: string,
  deps: GitDependencies = defaultGitDependencies,
): Promise<readonly string[]> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [
      GIT_RELEASE_SUBCOMMAND.LS_TREE,
      GIT_RELEASE_FLAG.RECURSIVE,
      GIT_RELEASE_FLAG.NAME_ONLY,
      GIT_RELEASE_FLAG.NULL_TERMINATED,
      ref,
    ],
    { cwd, reject: false, stripFinalNewline: false },
  );
  if (result.exitCode !== 0) return [];
  return result.stdout.split("\0").filter((path) => path.length > 0);
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
    [GIT_RELEASE_SUBCOMMAND.LOG, GIT_RELEASE_FLAG.NULL_TERMINATED, COMMIT_LOG_FORMAT, logRange(fromTag, toRef)],
    { cwd, reject: false, stripFinalNewline: false },
  );
  if (result.exitCode !== 0) return [];
  const fields = result.stdout.split(COMMIT_FIELD_SEPARATOR);
  if (fields.at(-1) === "") fields.pop();
  if (fields.length % COMMIT_FIELD_COUNT !== 0) throw new Error("Git returned an incomplete release commit record");
  const commits: GitCommit[] = [];
  for (let index = 0; index < fields.length; index += COMMIT_FIELD_COUNT) {
    const [sha, subject, body] = fields.slice(index, index + COMMIT_FIELD_COUNT);
    commits.push({ sha, subject, body });
  }
  return commits;
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
    [
      GIT_RELEASE_SUBCOMMAND.LOG,
      GIT_RELEASE_FLAG.DIFF_MERGES_FIRST_PARENT,
      EMPTY_LOG_FORMAT,
      GIT_RELEASE_FLAG.NAME_ONLY,
      logRange(fromTag, toRef),
    ],
    { cwd, reject: false },
  );
  if (result.exitCode !== 0) return [];
  return Array.from(new Set(nonEmptyLines(result.stdout)));
}
