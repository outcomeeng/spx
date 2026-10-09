import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  verifyChangeRunsCommand,
  type VerifyChangeRunsDeps,
  verifyRunComparisonCommand,
} from "@/commands/verify/change-runs";
import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyFinishCommand,
  verifyStartCommand,
  type VerifyStartReport,
  verifyStatusCommand,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { VerifyChangeRunsReport, VerifyRunComparisonReport } from "@/domains/verify/change-runs";
import {
  VERIFY_DRIVE_MODE,
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERB,
  type VerifyDriveMode,
  verifyInputRecordPath,
  type VerifyScopeType,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import type { JsonValue } from "@/lib/agent-run-journal";
import { detectGitCommonDirProductRoot, getCurrentBranch, getHeadSha, type GitDependencies } from "@/lib/git/root";
import { defaultStateStoreFileSystem, resolveBranchIdentity, slugBranchIdentity } from "@/lib/state-store";
import type { ChangeRunsScenario, RunComparisonFile } from "@testing/generators/verify/change-runs";
import { type FindingWithKey, sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  GIT_TEST_FLAGS,
  GIT_TEST_REF,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createRecordingStreamSink } from "@testing/harnesses/verify/harness";
import { initializeVerifyRepository, realVerifyGitDependencies } from "@testing/harnesses/verify/repository";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const CHANGE_RUNS_TEMP_PREFIX = "verify-change-runs-";
const MAIN_CHECKOUT_DIRECTORY = "product";
const COMMIT_FILES_MESSAGE = "Commit files a run comparison judges";

/**
 * A run a test started: the selectors `start` received, the drive mode it was opened with, the run
 * token it reported, the checkout it ran in, and the branch scope its journal and recorded input
 * live under.
 */
export interface StartedChangeRun {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly driveMode: VerifyDriveMode;
  readonly scopeType: VerifyScopeType;
  readonly scope: string;
  readonly cwd: string;
  readonly branchSlug: string;
}

/**
 * Which run to start: its verification type and scope type, the Change it serves, the checkout to
 * start it from, the drive mode `start` records — caller-driven unless spx opens the run itself —
 * and, for a changeset scope, the commit the range ends at, the repository's head commit unless named.
 */
export interface ChangeRunRequest {
  readonly verificationType: VerifyVerificationType;
  readonly scopeType: VerifyScopeType;
  readonly driveMode?: VerifyDriveMode;
  readonly change?: string;
  readonly cwd?: string;
  readonly changesetHead?: string;
}

/**
 * A real Git repository with a base commit and a head commit that adds the scenario's file, plus
 * the lifecycle operations a listing or run-comparison test drives. Every operation runs the production verify
 * commands against real Git and the real filesystem and returns their results or handles.
 */
export interface ChangeRunsRepository {
  readonly productDir: string;
  readonly baseCommit: string;
  readonly headCommit: string;
  readonly filePath: string;
  checkoutNewBranch(branch: string): Promise<void>;
  detachHead(): Promise<void>;
  renameBranch(from: string, to: string): Promise<void>;
  addWorktree(directory: string, branch: string): Promise<string>;
  /** Write each file into the main checkout, commit them on its checked-out branch, and return the new commit. */
  commitFiles(files: readonly RunComparisonFile[]): Promise<string>;
  startRun(request: ChangeRunRequest): Promise<StartedChangeRun>;
  /** Record `payload` as the run's scope evidence through the production `scope add` operation. */
  appendScope(run: StartedChangeRun, payload: JsonValue): Promise<void>;
  appendFindings(run: StartedChangeRun, findings: readonly FindingWithKey[]): Promise<void>;
  finish(run: StartedChangeRun, terminalStatus: string): Promise<void>;
  status(run: StartedChangeRun): Promise<VerifyStatusReport>;
  /** Delete the run's recorded-input sidecar from the store, leaving its journal untouched. */
  removeRecordedInput(run: StartedChangeRun): Promise<void>;
  listChangeRuns(change: string, cwd?: string): Promise<CliCommandResult>;
  /** Compare two started runs of `change` through the production run-comparison command, from the main checkout. */
  compareRuns(change: string, first: StartedChangeRun, second: StartedChangeRun): Promise<CliCommandResult>;
}

/**
 * The branch slug `start` files a run under when started from `cwd` with no branch override: the
 * slug of the checked-out branch, or of the detached head's commit.
 */
async function branchSlugAt(cwd: string, git: GitDependencies): Promise<string> {
  const branchName = (await getCurrentBranch(cwd, git)) ?? undefined;
  const headSha = await getHeadSha(cwd, git);
  if (headSha === null) throw new Error(`change-runs harness: no HEAD commit at ${cwd}`);
  return slugBranchIdentity(resolveBranchIdentity({ ...(branchName === undefined ? {} : { branchName }), headSha }));
}

function lifecycleDeps(cwd: string, inputContent: string, driveMode: VerifyDriveMode): VerifyCliDeps {
  return {
    cwd,
    driveMode,
    git: realVerifyGitDependencies(),
    processEnv: {},
    fs: defaultStateStoreFileSystem,
    readInputSource: async () => inputContent,
    readPayloadSource: (source: string) => Promise.resolve(source),
    journalBinding: { localSink: createRecordingStreamSink().sink },
  };
}

function listingDeps(cwd: string): VerifyChangeRunsDeps {
  return { cwd, git: realVerifyGitDependencies(), fs: defaultStateStoreFileSystem };
}

function requireOk(result: CliCommandResult, operation: string): CliCommandResult {
  if (result.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`change-runs harness: ${operation} failed: ${result.output}`);
  }
  return result;
}

/**
 * Create a real Git repository in a temporary directory — a base commit and a head commit adding
 * the scenario's file — and hand the callback the operations that start, extend, finish, inspect,
 * and list verification runs in it. The directory and every run recorded under its `.spx/` store
 * are removed when the callback settles.
 */
export async function withChangeRunsRepository<T>(
  scenario: ChangeRunsScenario,
  callback: (repository: ChangeRunsRepository) => Promise<T>,
): Promise<T> {
  return withTempDir(CHANGE_RUNS_TEMP_PREFIX, async (tempDir) => {
    const root = await realpath(tempDir);
    const productDir = join(root, MAIN_CHECKOUT_DIRECTORY);
    await mkdir(productDir);
    const { baseCommit, headCommit } = await initializeVerifyRepository(productDir, scenario.filePath);
    const inputContent = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
    const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const lifecycleSelectors = (run: StartedChangeRun) => ({
      verificationType: run.verificationType,
      scopeType: run.scopeType,
      scope: run.scope,
      run: run.runToken,
    });
    const scopeFor = (scopeType: VerifyScopeType, changesetHead: string): string =>
      scopeType === VERIFY_SCOPE_TYPE.CHANGESET
        ? `${baseCommit}${VERIFY_SCOPE_SEPARATOR}${changesetHead}`
        : scenario.filePath;

    const repository: ChangeRunsRepository = {
      productDir,
      baseCommit,
      headCommit,
      filePath: scenario.filePath,
      checkoutNewBranch: (branch) =>
        runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.NEW_BRANCH, branch]),
      detachHead: () => runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.DETACH]),
      renameBranch: (from, to) => runGit(productDir, [GIT_TEST_SUBCOMMANDS.BRANCH, GIT_TEST_FLAGS.MOVE, from, to]),
      addWorktree: async (directory, branch) => {
        const worktreeDir = join(root, directory);
        await runGit(productDir, [
          GIT_TEST_SUBCOMMANDS.WORKTREE,
          GIT_TEST_SUBCOMMANDS.ADD,
          GIT_TEST_FLAGS.NEW_BRANCH,
          branch,
          worktreeDir,
          headCommit,
        ]);
        return realpath(worktreeDir);
      },
      commitFiles: async (files) => {
        for (const file of files) {
          const absoluteFile = join(productDir, file.path);
          await mkdir(dirname(absoluteFile), { recursive: true });
          await writeFile(absoluteFile, file.content);
          await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, file.path]);
        }
        await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, COMMIT_FILES_MESSAGE]);
        return readGit(productDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_REF.HEAD_NAME]);
      },
      startRun: async (request) => {
        const cwd = request.cwd ?? productDir;
        const driveMode = request.driveMode ?? VERIFY_DRIVE_MODE.CALLER;
        const scope = scopeFor(request.scopeType, request.changesetHead ?? headCommit);
        const branchSlug = await branchSlugAt(cwd, realVerifyGitDependencies());
        const started = requireOk(
          await verifyStartCommand(
            {
              verificationType: request.verificationType,
              scopeType: request.scopeType,
              scope,
              input: VERIFY_INPUT_SOURCE.STDIN,
              ...(request.change === undefined ? {} : { change: request.change }),
            },
            lifecycleDeps(cwd, inputContent, driveMode),
          ),
          VERIFY_VERB.START,
        );
        return {
          runToken: (JSON.parse(started.output) as VerifyStartReport).runToken,
          verificationType: request.verificationType,
          driveMode,
          scopeType: request.scopeType,
          scope,
          cwd,
          branchSlug,
        };
      },
      appendScope: async (run, payload) => {
        requireOk(
          await verifyAppendScopeCommand(
            { ...lifecycleSelectors(run), payload: JSON.stringify(payload), idempotencyKey },
            lifecycleDeps(run.cwd, inputContent, run.driveMode),
          ),
          VERIFY_VERB.APPEND_SCOPE,
        );
      },
      appendFindings: async (run, findings) => {
        for (const entry of findings) {
          requireOk(
            await verifyAppendFindingCommand(
              {
                ...lifecycleSelectors(run),
                payload: JSON.stringify(entry.finding),
                idempotencyKey: entry.idempotencyKey,
              },
              lifecycleDeps(run.cwd, inputContent, run.driveMode),
            ),
            VERIFY_VERB.APPEND_FINDING,
          );
        }
      },
      finish: async (run, terminalStatus) => {
        requireOk(
          await verifyFinishCommand(
            { ...lifecycleSelectors(run), terminalStatus },
            lifecycleDeps(run.cwd, inputContent, run.driveMode),
          ),
          VERIFY_VERB.FINISH,
        );
      },
      status: async (run) => {
        const status = requireOk(
          await verifyStatusCommand(lifecycleSelectors(run), lifecycleDeps(run.cwd, inputContent, run.driveMode)),
          VERIFY_VERB.STATUS,
        );
        return JSON.parse(status.output) as VerifyStatusReport;
      },
      removeRecordedInput: async (run) => {
        const product = await detectGitCommonDirProductRoot(run.cwd, realVerifyGitDependencies());
        const inputPath = verifyInputRecordPath({
          productDir: product.productDir,
          branchSlug: run.branchSlug,
          type: run.verificationType,
          runToken: run.runToken,
        });
        if (!inputPath.ok) throw new Error(`change-runs harness: input record path failed: ${inputPath.error}`);
        await rm(inputPath.value);
      },
      listChangeRuns: (change, cwd) => verifyChangeRunsCommand({ change }, listingDeps(cwd ?? productDir)),
      compareRuns: (change, first, second) =>
        verifyRunComparisonCommand(
          { change, firstRun: first.runToken, secondRun: second.runToken },
          listingDeps(productDir),
        ),
    };
    return callback(repository);
  });
}

/** Parse a successful listing's JSON report. */
export function parseChangeRunsReport(output: string): VerifyChangeRunsReport {
  return JSON.parse(output) as VerifyChangeRunsReport;
}

/** Parse a successful run comparison's JSON report. */
export function parseRunComparisonReport(output: string): VerifyRunComparisonReport {
  return JSON.parse(output) as VerifyRunComparisonReport;
}

/**
 * Every value nested anywhere in a JSON document — the document itself, each array element, and
 * each object member value, recursively — so a test can ask whether a payload appears anywhere in it.
 */
export function jsonNodes(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return [value, ...value.flatMap((element) => jsonNodes(element))];
  if (typeof value === "object" && value !== null) {
    return [value, ...Object.values(value).flatMap((member) => jsonNodes(member))];
  }
  return [value];
}
