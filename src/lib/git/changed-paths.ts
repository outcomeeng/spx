import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { compareAsciiStrings } from "@/lib/state-store";

import {
  changesetNameStatusArgs,
  GIT_DIFF_COMMAND,
  GIT_NAME_STATUS_FLAG,
  GIT_NULL_DELIMITED_FLAG,
  pathsFromNameStatus,
  pathsFromNulDelimited,
} from "./name-status";

export const GIT_DIFF_CACHED_FLAG = "--cached";
export const GIT_LS_FILES_COMMAND = "ls-files";
export const GIT_LS_FILES_OTHERS_FLAG = "--others";
export const GIT_LS_FILES_EXCLUDE_STANDARD_FLAG = "--exclude-standard";

export interface GitChangedPathsDependencies {
  readonly git: GitDependencies;
}

export interface CommittedRangeChangedPathsOptions extends GitChangedPathsDependencies {
  readonly productDir: string;
  readonly base: string;
  readonly head: string;
}

export interface StagedComparisonChangedPathsOptions extends GitChangedPathsDependencies {
  readonly productDir: string;
  readonly base: string;
}

export interface WorktreeComparisonChangedPathsOptions extends GitChangedPathsDependencies {
  readonly productDir: string;
  readonly base: string;
}

export interface DirtyWorktreeChangedPathsOptions extends GitChangedPathsDependencies {
  readonly productDir: string;
}

export interface UntrackedChangedPathsOptions extends GitChangedPathsDependencies {
  readonly productDir: string;
}

function uniqueSortedPaths(paths: readonly string[]): readonly string[] {
  return [...new Set(paths)].sort(compareAsciiStrings);
}

async function gitStdout(
  git: GitDependencies,
  productDir: string,
  args: readonly string[],
  errorMessage: string,
): Promise<string> {
  const result = await git.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...args], { cwd: productDir, reject: false });
  if (result.exitCode !== 0) {
    throw new Error(`${errorMessage}: ${result.stderr}`);
  }
  return result.stdout;
}

export async function changedPathsForCommittedRange(
  options: CommittedRangeChangedPathsOptions,
): Promise<readonly string[]> {
  const stdout = await gitStdout(
    options.git,
    options.productDir,
    changesetNameStatusArgs(options.base, options.head),
    "failed to diff committed changed paths",
  );
  return pathsFromNameStatus(stdout);
}

export async function changedPathsForStagedComparison(
  options: StagedComparisonChangedPathsOptions,
): Promise<readonly string[]> {
  const stdout = await gitStdout(
    options.git,
    options.productDir,
    [
      GIT_DIFF_COMMAND,
      GIT_DIFF_CACHED_FLAG,
      GIT_NAME_STATUS_FLAG,
      GIT_NULL_DELIMITED_FLAG,
      options.base,
    ],
    "failed to diff staged changed paths",
  );
  return pathsFromNameStatus(stdout);
}

export async function changedPathsForWorktreeComparison(
  options: WorktreeComparisonChangedPathsOptions,
): Promise<readonly string[]> {
  const trackedStdout = await gitStdout(
    options.git,
    options.productDir,
    [
      GIT_DIFF_COMMAND,
      GIT_NAME_STATUS_FLAG,
      GIT_NULL_DELIMITED_FLAG,
      options.base,
    ],
    "failed to diff worktree changed paths",
  );
  const untrackedPaths = await untrackedProductPaths(options);
  return uniqueSortedPaths([
    ...pathsFromNameStatus(trackedStdout),
    ...untrackedPaths,
  ]);
}

export async function changedPathsForDirtyWorktree(
  options: DirtyWorktreeChangedPathsOptions,
): Promise<readonly string[]> {
  const trackedStdout = await gitStdout(
    options.git,
    options.productDir,
    [
      GIT_DIFF_COMMAND,
      GIT_NAME_STATUS_FLAG,
      GIT_NULL_DELIMITED_FLAG,
    ],
    "failed to diff dirty worktree paths",
  );
  const untrackedPaths = await untrackedProductPaths(options);
  return uniqueSortedPaths([
    ...pathsFromNameStatus(trackedStdout),
    ...untrackedPaths,
  ]);
}

export async function untrackedProductPaths(options: UntrackedChangedPathsOptions): Promise<readonly string[]> {
  const stdout = await gitStdout(
    options.git,
    options.productDir,
    [
      GIT_LS_FILES_COMMAND,
      GIT_LS_FILES_OTHERS_FLAG,
      GIT_LS_FILES_EXCLUDE_STANDARD_FLAG,
      GIT_NULL_DELIMITED_FLAG,
    ],
    "failed to list untracked paths",
  );
  return pathsFromNulDelimited(stdout);
}
