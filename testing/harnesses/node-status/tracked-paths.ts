import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ExecResult, GitDependencies } from "@/lib/git/root";
import { GIT_TEST_FLAGS, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
import { isolatedFixtureGitDependencies, runFixtureGit } from "@testing/harnesses/node-status/node-status";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const STAGED_REPOSITORY_PREFIX = "spx-node-status-tracked-paths-";
const STAGED_FILE_CONTENT = "";
const ANSWERED_STDERR = "";

/** One invocation the observing git runner received: the executable, its argument vector, and its working directory. */
export type GitInvocation = {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string | undefined;
};

/** A real temporary git repository whose index holds exactly the staged files, and an observing runner over real git. */
export type StagedRepository = {
  readonly productDir: string;
  /** Forwards every invocation to real git in the isolated git test environment and records it. */
  readonly git: {
    readonly deps: GitDependencies;
    readonly invocations: readonly GitInvocation[];
  };
};

/**
 * Wrap `inner` in a recording collaborator: every invocation is forwarded unchanged
 * to `inner`, and its executable, arguments, and working directory are appended to
 * `invocations` (spy at the injected git boundary), so a test observes both the
 * command the tracked-path query ran and the answer the real git gave it.
 */
export function createObservingGitDependencies(inner: GitDependencies): {
  readonly deps: GitDependencies;
  readonly invocations: readonly GitInvocation[];
} {
  const invocations: GitInvocation[] = [];
  return {
    deps: {
      execa: (executable, args, options) => {
        invocations.push({ executable, args: [...args], cwd: options?.cwd });
        return inner.execa(executable, args, options);
      },
    },
    invocations,
  };
}

/**
 * Initialize a git repository in a fresh temporary directory, write each of `files`
 * (product-relative, `/`-separated) as an empty file, and stage them all, so git
 * itself writes any listing the callback asks for. The callback receives the
 * repository root and an observing runner over the isolated fixture git runner.
 */
export async function withStagedRepository(
  files: ReadonlySet<string>,
  callback: (repository: StagedRepository) => Promise<void>,
): Promise<void> {
  await withTempDir(STAGED_REPOSITORY_PREFIX, async (productDir) => {
    await runFixtureGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    for (const file of files) {
      const absolutePath = join(productDir, file);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, STAGED_FILE_CONTENT);
    }
    await runFixtureGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, GIT_TEST_FLAGS.ALL]);
    await callback({ productDir, git: createObservingGitDependencies(isolatedFixtureGitDependencies) });
  });
}

/**
 * A git runner that answers every invocation with the chosen exit code and standard
 * output, and empty standard error, without running git — standing in for a git run
 * that exits with an arbitrary code (failure simulation at the injected git boundary:
 * a real git cannot be made to exit with an arbitrary code on demand).
 */
export function createAnsweringGitDependencies(
  answer: Omit<ExecResult, "stderr">,
): GitDependencies {
  return { execa: () => Promise.resolve({ ...answer, stderr: ANSWERED_STDERR }) };
}

/**
 * A git runner whose every invocation rejects with `cause`, standing in for an
 * unavailable git executable (failure simulation at the injected git boundary).
 */
export function createFailingGitDependencies(cause: Error): GitDependencies {
  return { execa: () => Promise.reject(cause) };
}
