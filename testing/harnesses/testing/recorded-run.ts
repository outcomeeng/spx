import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { runTestsCommand, type TestCommandDependencies } from "@/commands/test";
import { GIT_ROOT_COMMAND } from "@/lib/git/root";
import { compareAsciiStrings } from "@/lib/state-store";
import { testingRegistry } from "@/test/registry";
import { testingRunsDir } from "@/test/run-state";
import { GIT_TEST_CONFIG, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";
import { realVerifyGitDependencies } from "@testing/harnesses/verify/repository";

const STATE_DIRECTORY_IGNORE_ENTRY = ".spx/\n";
const GITIGNORE_FILENAME = ".gitignore";
const FIXTURE_COMMIT_MESSAGE = "Record the test file fixture";
const CHANGE_COMMIT_MESSAGE = "Change the test file fixture";
const UNTRACKED_FILENAME = "untracked-change.txt";
const FILE_ENCODING = "utf8";
const PASSING_RUNNER_EXIT_CODE = 0;

/** A real git checkout holding one committed test file, with the run state directory ignored. */
export interface RecordedRunRepository {
  readonly productDir: string;
  readonly testFile: string;
  readonly deps: TestCommandDependencies;
}

/** Run file name to run file content for every file under the run directory. */
export type RunDirectorySnapshot = ReadonlyMap<string, string>;

/** Provides a real git checkout that holds `testFile` committed at its head, removed after the callback settles. */
export function withRecordedRunRepository(
  testFile: string,
  callback: (repository: RecordedRunRepository) => Promise<void>,
): Promise<void> {
  return withTestingTempProductDir(async (productDir) => {
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    await runGit(productDir, [GIT_ROOT_COMMAND.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
    await runGit(productDir, [GIT_ROOT_COMMAND.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
    await writeFile(join(productDir, GITIGNORE_FILENAME), STATE_DIRECTORY_IGNORE_ENTRY);
    await writeProductFile(productDir, testFile, "");
    await commitAll(productDir, FIXTURE_COMMIT_MESSAGE);
    const runner = createRecordingCommandRunner({ present: true, exitCode: PASSING_RUNNER_EXIT_CODE });
    await callback({
      productDir,
      testFile,
      deps: { registry: testingRegistry, runnerDepsFor: () => runner, git: realVerifyGitDependencies() },
    });
  });
}

/** Executes the checkout's tests through the command, which records one passed run. */
export async function recordPassedRun(repository: RecordedRunRepository): Promise<void> {
  await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);
}

/** Leaves an untracked, git-visible file in the worktree. */
export async function leaveUntrackedFile(repository: RecordedRunRepository): Promise<void> {
  await writeProductFile(repository.productDir, UNTRACKED_FILENAME, "");
}

/** Commits a content change to the test file, moving the head commit. */
export async function commitTestFileChange(repository: RecordedRunRepository, content: string): Promise<void> {
  await writeProductFile(repository.productDir, repository.testFile, content);
  await commitAll(repository.productDir, CHANGE_COMMIT_MESSAGE);
}

/** Reads every file under the run directory, keyed by file name. */
export async function snapshotRunDirectory(productDir: string): Promise<RunDirectorySnapshot> {
  const runsDir = testingRunsDir(productDir);
  const names = await readdir(runsDir);
  const entries = await Promise.all(
    [...names].sort(compareAsciiStrings).map(async (name) =>
      [name, await readFile(join(runsDir, name), FILE_ENCODING)] as const
    ),
  );
  return new Map(entries);
}

async function writeProductFile(productDir: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(productDir, relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

async function commitAll(productDir: string, message: string): Promise<void> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, "."]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, "-m", message]);
}
