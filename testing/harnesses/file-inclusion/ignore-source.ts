import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { IgnoreSourceReaderConfig } from "@/lib/file-inclusion/ignore-source";
import {
  DEFAULT_IGNORE_SOURCE_OVERRIDES,
  GIT_SCOPE_DEFAULT_NODE_MAX_BUFFER_BYTES,
} from "@/lib/file-inclusion/ignore-source";

import { GIT_WORKTREE_TEST_GENERATOR, sampleGitWorktreeTestValue } from "@testing/generators/git-worktree/git-worktree";

export { PROPERTY_NUM_RUNS } from "@testing/harnesses/spec-tree/generators";

const LARGE_SCOPE_DIRECTORY = "bulk-scope";
const LARGE_SCOPE_EXTENSION = ".txt";
const LARGE_SCOPE_FILENAME_STEM_CHARACTER = "x";
const LARGE_SCOPE_FILENAME_STEM_LENGTH = 220;
const LARGE_SCOPE_INDEX_WIDTH = 5;
const LARGE_SCOPE_OUTPUT_MARGIN_BYTES = 1;
const LARGE_SCOPE_BATCH_SIZE = 64;
const LARGE_SCOPE_SAMPLE_INDEX = 0;
const LARGE_SCOPE_FILENAME_STEM = LARGE_SCOPE_FILENAME_STEM_CHARACTER.repeat(LARGE_SCOPE_FILENAME_STEM_LENGTH);

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

export async function writeScopeLargerThanDefaultBuffer(root: string): Promise<string> {
  const count = largeScopeFileCount();
  for (let start = 0; start < count; start += LARGE_SCOPE_BATCH_SIZE) {
    const end = Math.min(start + LARGE_SCOPE_BATCH_SIZE, count);
    await Promise.all(
      Array.from({ length: end - start }, async (_unused, offset) => {
        await writeUnderDirectory(root, largeScopePath(start + offset), fileContent());
      }),
    );
  }
  return largeScopePath(LARGE_SCOPE_SAMPLE_INDEX);
}

function largeScopePath(index: number): string {
  return [
    LARGE_SCOPE_DIRECTORY,
    `${String(index).padStart(LARGE_SCOPE_INDEX_WIDTH, "0")}-${LARGE_SCOPE_FILENAME_STEM}${LARGE_SCOPE_EXTENSION}`,
  ].join("/");
}

function largeScopeFileCount(): number {
  return Math.ceil(
    (GIT_SCOPE_DEFAULT_NODE_MAX_BUFFER_BYTES + LARGE_SCOPE_OUTPUT_MARGIN_BYTES) / (largeScopePath(0).length + 1),
  );
}

async function writeUnderDirectory(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
