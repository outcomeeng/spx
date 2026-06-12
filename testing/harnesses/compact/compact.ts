/**
 * Compact test harness — writes a transcript fixture into a directory and
 * returns its path. Owns the transcript fixture filename in one place so command
 * tests obtain `--transcript` paths without re-spelling the name per file.
 *
 * @module harnesses/compact/compact
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import type { GitWorktreeEnv } from "@testing/harnesses/git-worktree/git-worktree";

const TRANSCRIPT_FIXTURE_FILENAME = "transcript.jsonl";
const LINKED_WORKTREE_BASE_COMMIT_MESSAGE = "compact stash linked-worktree base commit";
const LINKED_WORKTREE_DIRNAME = "linked-wt";

/** Writes `content` as a transcript fixture under `dir` and returns the absolute path. */
export async function writeTranscriptFixture(dir: string, content: string): Promise<string> {
  const path = join(dir, TRANSCRIPT_FIXTURE_FILENAME);
  await writeFile(path, content);
  return path;
}

/**
 * Commits a seed file in `env` (the root worktree) and adds a detached linked
 * worktree of the same repository, returning the linked worktree's path. Lets a
 * test prove shared `.spx/` resolution across a bare-pool-style worktree layout.
 */
export async function addDetachedLinkedWorktree(env: GitWorktreeEnv): Promise<string> {
  await env.runGit([
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    LINKED_WORKTREE_BASE_COMMIT_MESSAGE,
  ]);
  const linkedPath = join(env.productDir, LINKED_WORKTREE_DIRNAME);
  await env.runGit([GIT_TEST_SUBCOMMANDS.WORKTREE, GIT_TEST_SUBCOMMANDS.ADD, GIT_TEST_FLAGS.DETACH, linkedPath]);
  return linkedPath;
}
