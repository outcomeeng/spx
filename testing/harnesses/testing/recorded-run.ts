import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  RECORDED_RUN_UNSATISFIED_REASON,
  runTestsCommand,
  TEST_RESULT_KIND,
  type TestCommandDependencies,
  type TestsCommandResult,
} from "@/commands/test";
import type { TestingCliDependencies } from "@/interfaces/cli/test";
import { GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { compareAsciiStrings, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import type { TargetSelection } from "@/lib/test-targeting";
import { testingRegistry } from "@/test/registry";
import {
  createTestRunFile,
  formatTestRunTimestamp,
  TEST_RUN_STATE_STATUS,
  TESTING_RUN_STATE_ERROR_CODE,
  testingRunsDir,
  writeTerminalTestRunState,
} from "@/test/run-state";
import { GIT_TEST_CONFIG, GIT_TEST_SUBCOMMANDS, runGit } from "@testing/harnesses/git-test-constants";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
import { SIMULATED_REPORT } from "@testing/harnesses/testing/simulated-report";
import {
  createRecordingCommandRunner,
  type RecordingCommandRunner,
} from "@testing/harnesses/testing/typescript-runner";
import { realVerifyGitDependencies } from "@testing/harnesses/verify/repository";

const STATE_DIRECTORY_IGNORE_ENTRY = `${STATE_STORE_SCOPE_PATH.SPX_DIR}/\n`;
const GITIGNORE_FILENAME = ".gitignore";
const FIXTURE_COMMIT_MESSAGE = "Record the test file fixture";
const CHANGE_COMMIT_MESSAGE = "Change the test file fixture";
const UNTRACKED_FILENAME = "untracked-change.txt";
const FILE_ENCODING = "utf8";
const ASSUME_UNCHANGED_FLAG = "--assume-unchanged";
const PASSING_RUNNER_EXIT_CODE = 0;
const FAILING_RUNNER_EXIT_CODE = 1;
const GIT_UNRESOLVED_EXIT_CODE = 128;
const CLOCK_STEP_MILLIS = 1000;

/** A real git checkout holding one committed test file, with the run state directory ignored. */
export interface RecordedRunRepository {
  readonly productDir: string;
  readonly testFile: string;
  readonly deps: TestCommandDependencies;
  /** The strictly increasing clock `deps` records runs by. */
  readonly now: () => Date;
  /** The recording runner every dispatch through `deps` reaches; its calls show whether a runner was invoked. */
  readonly runner: RecordingCommandRunner;
}

/**
 * The states a request's recorded runs can be in while none of them satisfies the request. The failed,
 * interrupted, incomplete, and partial-coverage members are the states the evidence-reuse rule names;
 * the remaining members are the further conditions under which a recorded passed run is not reused.
 */
export const UNSATISFIED_REQUEST_CASE = {
  NO_RECORDED_RUN: RECORDED_RUN_UNSATISFIED_REASON.NO_COVERING_RUN,
  PARTIAL_COVERAGE: "partial-coverage",
  FAILED_RUN: TEST_RUN_STATE_STATUS.FAILED,
  INTERRUPTED_RUN: TEST_RUN_STATE_STATUS.INTERRUPTED,
  INCOMPLETE_RUN: "incomplete-run",
  FILE_NOT_PASSED: RECORDED_RUN_UNSATISFIED_REASON.FILE_NOT_PASSED,
  GIT_IDENTITY_UNRESOLVED: RECORDED_RUN_UNSATISFIED_REASON.GIT_IDENTITY_UNRESOLVED,
  HEAD_DIFFERS: RECORDED_RUN_UNSATISFIED_REASON.HEAD_DIFFERS,
  WORKTREE_DIRTY: RECORDED_RUN_UNSATISFIED_REASON.WORKTREE_DIRTY,
  STALE_RUN: RECORDED_RUN_UNSATISFIED_REASON.STALE,
} as const;

export type UnsatisfiedRequestCase = (typeof UNSATISFIED_REQUEST_CASE)[keyof typeof UNSATISFIED_REQUEST_CASE];

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
    const now = strictlyIncreasingClock();
    await callback({
      productDir,
      testFile,
      deps: {
        registry: testingRegistry,
        runnerDepsFor: () => runner,
        git: realVerifyGitDependencies(),
        now,
      },
      now,
      runner,
    });
  });
}

// Successive runs recorded within one millisecond would tie on their timestamps and fall back
// to the random run-file-name order, so each clock reading advances past the previous one.
function strictlyIncreasingClock(): () => Date {
  let millis = Date.now();
  return () => {
    millis += CLOCK_STEP_MILLIS;
    return new Date(millis);
  };
}

/** Commits one more empty test file, so a later recorded run covers it beside the repository's test file. */
export async function commitAdditionalTestFile(repository: RecordedRunRepository, testFile: string): Promise<void> {
  await writeProductFile(repository.productDir, testFile, "");
  await commitAll(repository.productDir, FIXTURE_COMMIT_MESSAGE);
}

/** Executes the checkout's tests through the command, which records one passed run. */
export async function recordPassedRun(
  repository: RecordedRunRepository,
  targets?: TargetSelection,
): Promise<TestsCommandResult> {
  return await runTestsCommand(
    { productDir: repository.productDir, passing: false, targets, requireExecution: true },
    repository.deps,
  );
}

/**
 * The testing CLI's dependencies wired to the real command over the repository's recording runner,
 * so an invocation through the CLI reaches the same dispatch a caller's does. Each call a CLI action
 * makes is recorded with the execution requirement it carried.
 */
export function recordedRunCliDependencies(repository: RecordedRunRepository): TestingCliDependencies {
  const run: TestingCliDependencies["runTests"] = (productDir, passing, targets, changed, requireExecution) =>
    runTestsCommand({ productDir, passing, targets, changed, requireExecution }, repository.deps);
  return {
    resolveProductDir: () => Promise.resolve(repository.productDir),
    runTests: run,
    runAgentTests: run,
    writeStdout: () => undefined,
    writeWarning: () => undefined,
    setExitCode: () => undefined,
    exit: () => {
      throw new Error("Unexpected testing CLI process exit in recorded run fixture");
    },
  };
}

/** Records one run in which the runner exits non-zero, so the run's status is `failed`. */
async function recordFailedRun(repository: RecordedRunRepository): Promise<void> {
  const failing = createRecordingCommandRunner({ present: true, exitCode: FAILING_RUNNER_EXIT_CODE });
  await runTestsCommand(
    { productDir: repository.productDir, passing: false, requireExecution: true },
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
    { productDir: repository.productDir, passing: false, requireExecution: true },
    { ...repository.deps, runnerDepsFor: () => omitting },
  );
}

/** Records a run that executed the selection and ended `interrupted`, later than every run recorded before it. */
async function recordInterruptedRun(repository: RecordedRunRepository): Promise<void> {
  const executed = await recordPassedRun(repository);
  if (executed.kind !== TEST_RESULT_KIND.EXECUTED) throw new Error("Expected the required execution to run");
  const runFile = await createTestRunFile(repository.productDir, { now: repository.now });
  if (!runFile.ok) throw new Error(runFile.error);
  const written = await writeTerminalTestRunState(runFile.value.runFilePath, {
    ...executed.recorded,
    startedAt: runFile.value.startedAt,
    completedAt: formatTestRunTimestamp(repository.now()),
    status: TEST_RUN_STATE_STATUS.INTERRUPTED,
  });
  if (!written.ok) throw new Error(written.error);
}

/** Leaves a run file that no terminal state was ever written to, as a run that ended before it completed. */
async function recordIncompleteRun(repository: RecordedRunRepository): Promise<void> {
  const runFile = await createTestRunFile(repository.productDir, { now: repository.now });
  if (!runFile.ok) throw new Error(runFile.error);
}

/** Records one passed run per file, so each file is covered by a run and no run covers both. */
async function recordPassedRunPerFile(
  repository: RecordedRunRepository,
  additionalFile: string,
): Promise<void> {
  await commitAdditionalTestFile(repository, additionalFile);
  for (const operand of [repository.testFile, additionalFile]) {
    await recordPassedRun(repository, { operands: [operand], recursive: false });
  }
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
 * Brings the checkout to the one state in which the recorded runs fail to satisfy a request for the
 * checkout's test files in the stated way alone, and returns the dependencies the request runs under.
 * `additionalFile` is a second test file, committed only where the state needs one.
 */
export async function arrangeUnsatisfiedRequest(
  repository: RecordedRunRepository,
  unsatisfiedCase: UnsatisfiedRequestCase,
  changedContent: string,
  additionalFile: string,
): Promise<TestCommandDependencies> {
  switch (unsatisfiedCase) {
    case UNSATISFIED_REQUEST_CASE.NO_RECORDED_RUN:
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.PARTIAL_COVERAGE:
      await recordPassedRunPerFile(repository, additionalFile);
      return repository.deps;
    // A passed run precedes the failed, interrupted, and omitted-verdict run, so the later covering
    // run alone decides the request and the earlier passed run never stands in for it.
    case UNSATISFIED_REQUEST_CASE.FAILED_RUN:
      await recordPassedRun(repository);
      await recordFailedRun(repository);
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.INTERRUPTED_RUN:
      await recordInterruptedRun(repository);
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.INCOMPLETE_RUN:
      await recordIncompleteRun(repository);
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.FILE_NOT_PASSED:
      await recordPassedRun(repository);
      await recordRunWithOmittedVerdicts(repository);
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.GIT_IDENTITY_UNRESOLVED:
      await recordPassedRun(repository);
      return { ...repository.deps, git: unresolvedGitDependencies() };
    case UNSATISFIED_REQUEST_CASE.HEAD_DIFFERS:
      await recordPassedRun(repository);
      await commitTestFileChange(repository, changedContent);
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.WORKTREE_DIRTY:
      await recordPassedRun(repository);
      await leaveUntrackedFile(repository);
      return repository.deps;
    case UNSATISFIED_REQUEST_CASE.STALE_RUN:
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
    if (error.code === TESTING_RUN_STATE_ERROR_CODE.NOT_FOUND) return [];
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
