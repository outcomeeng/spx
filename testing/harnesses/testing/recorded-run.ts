import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  RECORDED_RUN_UNSATISFIED_REASON,
  type RecordedRunUnsatisfiedReason,
  runTestsCommand,
  type TestCommandDependencies,
  type TestsCommandResult,
} from "@/commands/test";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { compareAsciiStrings } from "@/lib/state-store";
import { testingRegistry } from "@/test/registry";
import { testingRunsDir } from "@/test/run-state";
import { GIT_TEST_CONFIG, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
import { SIMULATED_REPORT } from "@testing/harnesses/testing/simulated-report";
import {
  createRecordingCommandRunner,
  type RecordingCommandRunner,
} from "@testing/harnesses/testing/typescript-runner";
import { realVerifyGitDependencies } from "@testing/harnesses/verify/repository";

const STATE_DIRECTORY_IGNORE_ENTRY = ".spx/\n";
const GITIGNORE_FILENAME = ".gitignore";
const FIXTURE_COMMIT_MESSAGE = "Record the test file fixture";
const CHANGE_COMMIT_MESSAGE = "Change the test file fixture";
const UNTRACKED_FILENAME = "untracked-change.txt";
const FILE_ENCODING = "utf8";
const MISSING_DIRECTORY_CODE = "ENOENT";
const ASSUME_UNCHANGED_FLAG = "--assume-unchanged";
const PASSING_RUNNER_EXIT_CODE = 0;
const FAILING_RUNNER_EXIT_CODE = 1;
const GIT_UNRESOLVED_EXIT_CODE = 128;

/** A real git checkout holding one committed test file, with the run state directory ignored. */
export interface RecordedRunRepository {
  readonly productDir: string;
  readonly testFile: string;
  readonly deps: TestCommandDependencies;
  /** The recording runner every dispatch through `deps` reaches; its calls show whether a runner was invoked. */
  readonly runner: RecordingCommandRunner;
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
      runner,
    });
  });
}

/** Executes the checkout's tests through the command, which records one passed run. */
export async function recordPassedRun(repository: RecordedRunRepository): Promise<TestsCommandResult> {
  return await runTestsCommand({ productDir: repository.productDir, passing: false }, repository.deps);
}

/** Records one run in which the runner exits non-zero, so the run's status is `failed`. */
async function recordFailedRun(repository: RecordedRunRepository): Promise<void> {
  const failing = createRecordingCommandRunner({ present: true, exitCode: FAILING_RUNNER_EXIT_CODE });
  await runTestsCommand(
    { productDir: repository.productDir, passing: false },
    { ...repository.deps, runnerDepsFor: () => failing },
  );
}

/** Records one run that passes while the runner's report omits every test file, so each file's verdict is `not-run`. */
async function recordRunWithOmittedVerdicts(repository: RecordedRunRepository): Promise<void> {
  const omitting = createRecordingCommandRunner({
    present: true,
    exitCode: PASSING_RUNNER_EXIT_CODE,
    report: SIMULATED_REPORT.MISSING,
  });
  await runTestsCommand(
    { productDir: repository.productDir, passing: false },
    { ...repository.deps, runnerDepsFor: () => omitting },
  );
}

function unresolvedGitDependencies(): GitDependencies {
  return { execa: async () => ({ exitCode: GIT_UNRESOLVED_EXIT_CODE, stdout: "", stderr: "" }) };
}

/** Changes the test file's content while the index records it unchanged, so git reports a clean worktree. */
async function changeTestFileHiddenFromGit(repository: RecordedRunRepository, content: string): Promise<void> {
  await runGit(repository.productDir, [GIT_TEST_SUBCOMMANDS.UPDATE_INDEX, ASSUME_UNCHANGED_FLAG, repository.testFile]);
  await writeProductFile(repository.productDir, repository.testFile, content);
}

/**
 * Brings the checkout to the one state in which a recorded run fails to satisfy a request for the
 * test file for the stated reason alone, and returns the dependencies the request runs under.
 */
export async function arrangeUnsatisfiedRequest(
  repository: RecordedRunRepository,
  reason: RecordedRunUnsatisfiedReason,
  changedContent: string,
): Promise<TestCommandDependencies> {
  switch (reason) {
    case RECORDED_RUN_UNSATISFIED_REASON.NO_COVERING_RUN:
      return repository.deps;
    case RECORDED_RUN_UNSATISFIED_REASON.RUN_NOT_PASSED:
      await recordFailedRun(repository);
      return repository.deps;
    case RECORDED_RUN_UNSATISFIED_REASON.FILE_NOT_PASSED:
      await recordRunWithOmittedVerdicts(repository);
      return repository.deps;
    case RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED:
      await recordPassedRun(repository);
      return { ...repository.deps, git: unresolvedGitDependencies() };
    case RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS:
      await recordPassedRun(repository);
      await commitTestFileChange(repository, changedContent);
      return repository.deps;
    case RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY:
      await recordPassedRun(repository);
      await leaveUntrackedFile(repository);
      return repository.deps;
    case RECORDED_RUN_UNSATISFIED_REASON.STALE:
      await recordPassedRun(repository);
      await changeTestFileHiddenFromGit(repository, changedContent);
      return repository.deps;
  }
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

/** Reads every file under the run directory, keyed by file name; a run directory not yet created holds none. */
export async function snapshotRunDirectory(productDir: string): Promise<RunDirectorySnapshot> {
  const runsDir = testingRunsDir(productDir);
  const names = await readdir(runsDir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === MISSING_DIRECTORY_CODE) return [];
    throw error;
  });
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
