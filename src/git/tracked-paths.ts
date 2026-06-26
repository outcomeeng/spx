import { GIT_ROOT_COMMAND, type GitDependencies } from "@/git/root";

const GIT_DIR_OPTION = "-C";
const GIT_LS_FILES_SUBCOMMAND = "ls-files";
const GIT_NUL_TERMINATED_FLAG = "-z";

/** NUL byte separating entries in `git ls-files -z` output. */
export const TRACKED_PATH_NUL_SEPARATOR = "\0";
/** Path-segment separator git uses in `ls-files` output, regardless of platform. */
export const TRACKED_PATH_DIRECTORY_SEPARATOR = "/";
/** Exit code a successful `git ls-files` run returns; any other value means no git repository. */
export const GIT_SUCCESS_EXIT_CODE = 0;

/**
 * The paths git tracks under `productDir`, relative to it, as a set, or
 * `undefined` when `productDir` is not a git repository.
 *
 * Reads through the injected git runner — `git -C <productDir> ls-files -z`
 * emits NUL-separated tracked paths, which is robust to paths containing
 * newlines or spaces. Outside a git repository the command
 * exits non-zero; that returns `undefined` so a caller applies no git scoping
 * rather than treating every path as untracked.
 */
export async function listTrackedPaths(
  productDir: string,
  deps: GitDependencies,
): Promise<ReadonlySet<string> | undefined> {
  const result = await deps.execa(
    GIT_ROOT_COMMAND.EXECUTABLE,
    [GIT_DIR_OPTION, productDir, GIT_LS_FILES_SUBCOMMAND, GIT_NUL_TERMINATED_FLAG],
    { cwd: productDir, reject: false },
  );
  if (result.exitCode !== GIT_SUCCESS_EXIT_CODE) return undefined;
  return new Set(result.stdout.split(TRACKED_PATH_NUL_SEPARATOR).filter((entry) => entry.length > 0));
}

/**
 * A path-inclusion predicate that admits a path only when git tracks a file at
 * or under it — the tracked files themselves and every ancestor directory of a
 * tracked file. A node-shaped directory with no tracked file under it is
 * rejected, so a stale, untracked directory never enters a git-scoped walk.
 *
 * `undefined` tracked paths means no git scoping is available (the directory is
 * not a git repository), so every path is admitted.
 */
export function createTrackedPathInclusion(
  trackedPaths: ReadonlySet<string> | undefined,
): (path: string) => boolean {
  if (trackedPaths === undefined) return () => true;
  const admitted = new Set<string>(trackedPaths);
  for (const trackedPath of trackedPaths) {
    let separatorIndex = trackedPath.indexOf(TRACKED_PATH_DIRECTORY_SEPARATOR);
    while (separatorIndex !== -1) {
      admitted.add(trackedPath.slice(0, separatorIndex));
      separatorIndex = trackedPath.indexOf(TRACKED_PATH_DIRECTORY_SEPARATOR, separatorIndex + 1);
    }
  }
  return (path: string) => admitted.has(path);
}
