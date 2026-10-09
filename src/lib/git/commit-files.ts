import { type ExecResult, GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";

/** The `git ls-tree` invocation that lists a commit's entries for named paths, matched literally. */
export const GIT_COMMIT_FILES_COMMAND = {
  /** Reads every pathspec as a literal path, so a glob character in a path matches only itself. */
  LITERAL_PATHSPECS: "--literal-pathspecs",
  LS_TREE: "ls-tree",
  NUL_TERMINATED: "-z",
  /** Reads and reports paths relative to the repository root, independent of the working directory. */
  FULL_TREE: "--full-tree",
  PATHS_SEPARATOR: "--",
} as const;

/** The `ls-tree` object type of a file entry; trees and submodule commits are not files. */
export const GIT_BLOB_OBJECT_TYPE = "blob";

const LS_TREE_ENTRY_SEPARATOR = "\0";
const LS_TREE_PATH_SEPARATOR = "\t";
const LS_TREE_FIELD_SEPARATOR = " ";
const LS_TREE_OBJECT_TYPE_FIELD_INDEX = 1;
const LS_TREE_OBJECT_NAME_FIELD_INDEX = 2;
const GIT_SUCCESS_EXIT_CODE = 0;

/** One `ls-tree -z` entry: its object type, object name, and root-relative path. */
interface LsTreeEntry {
  readonly type: string;
  readonly objectName: string;
  readonly path: string;
}

/** The fields of one `ls-tree -z` entry, or `undefined` for a malformed one. */
function parseLsTreeEntry(entry: string): LsTreeEntry | undefined {
  const pathStart = entry.indexOf(LS_TREE_PATH_SEPARATOR);
  if (pathStart === -1) return undefined;
  const fields = entry.slice(0, pathStart).split(LS_TREE_FIELD_SEPARATOR);
  if (fields.length <= LS_TREE_OBJECT_NAME_FIELD_INDEX) return undefined;
  return {
    type: fields[LS_TREE_OBJECT_TYPE_FIELD_INDEX],
    objectName: fields[LS_TREE_OBJECT_NAME_FIELD_INDEX],
    path: entry.slice(pathStart + LS_TREE_PATH_SEPARATOR.length),
  };
}

/**
 * The blob object name of each of `paths` that `commit` holds as a file, keyed by
 * repository-root-relative path, or `undefined` when git cannot read the commit's tree — an unknown
 * commit, no repository, or no git executable. A path the commit holds as a directory or a submodule
 * is not a file and is absent from the result, as is a path the commit does not hold at all. Two
 * commits hold a file with the same content exactly when its blob object names are equal.
 *
 * Reads through the injected git runner with one `git ls-tree` over every path: literal pathspecs
 * keep a glob character from matching other files, `--full-tree` keeps the reported paths
 * root-relative whatever `cwd` is, and NUL-terminated output keeps a path with a tab or newline
 * whole.
 */
export async function readCommitBlobs(
  commit: string,
  paths: readonly string[],
  cwd: string,
  deps: GitDependencies,
): Promise<ReadonlyMap<string, string> | undefined> {
  if (paths.length === 0) return new Map();
  let result: ExecResult;
  try {
    result = await deps.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [
        GIT_COMMIT_FILES_COMMAND.LITERAL_PATHSPECS,
        GIT_COMMIT_FILES_COMMAND.LS_TREE,
        GIT_COMMIT_FILES_COMMAND.NUL_TERMINATED,
        GIT_COMMIT_FILES_COMMAND.FULL_TREE,
        commit,
        GIT_COMMIT_FILES_COMMAND.PATHS_SEPARATOR,
        ...paths,
      ],
      { cwd, reject: false },
    );
  } catch {
    return undefined;
  }
  if (result.exitCode !== GIT_SUCCESS_EXIT_CODE) return undefined;
  const blobs = new Map<string, string>();
  for (const entry of result.stdout.split(LS_TREE_ENTRY_SEPARATOR)) {
    const parsed = parseLsTreeEntry(entry);
    if (parsed?.type === GIT_BLOB_OBJECT_TYPE) blobs.set(parsed.path, parsed.objectName);
  }
  return blobs;
}

/**
 * The subset of `paths` that `commit` holds as files, by repository-root-relative path, or
 * `undefined` when git cannot read the commit's tree. Derived from {@link readCommitBlobs}, so a
 * path is held as a file exactly when the commit carries a blob for it.
 */
export async function listCommitFiles(
  commit: string,
  paths: readonly string[],
  cwd: string,
  deps: GitDependencies,
): Promise<ReadonlySet<string> | undefined> {
  const blobs = await readCommitBlobs(commit, paths, cwd, deps);
  return blobs === undefined ? undefined : new Set(blobs.keys());
}
