import type { IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import { DEFAULT_IGNORE_SOURCE_OVERRIDES } from "@/lib/file-inclusion/ignore-source";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

export function readerConfig(
  overrides: IgnoreSourceReaderConfig["overrides"] = DEFAULT_IGNORE_SOURCE_OVERRIDES,
): IgnoreSourceReaderConfig {
  return { overrides };
}

export function trackedFilePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.trackedFilePath());
}

export function untrackedFilePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.untrackedFilePath());
}

export function ignoredPattern(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.gitignorePattern());
}

export function fileContent(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.fileContent());
}

export function submodulePath(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.submodulePath());
}

export function bogusGitDir(): string {
  return sampleGitWorktreeTestValue(GIT_WORKTREE_TEST_GENERATOR.bogusGitDir());
}
