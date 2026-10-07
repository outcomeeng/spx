import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";

import { verifyChangeRunsCommand, type VerifyChangeRunsDeps } from "@/commands/verify/change-runs";
import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  type VerifyCliDeps,
  verifyFinishCommand,
  verifyStartCommand,
  type VerifyStartReport,
  verifyStatusCommand,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { VerifyChangeRunsReport } from "@/domains/verify/change-runs";
import {
  VERIFY_INPUT_SOURCE,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERB,
  type VerifyScopeType,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import type { GitDependencies } from "@/lib/git/root";
import { defaultStateStoreFileSystem } from "@/lib/state-store";
import type { ChangeRunsScenario } from "@testing/generators/verify/change-runs";
import { type FindingWithKey, sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_REF,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createRecordingStreamSink } from "@testing/harnesses/verify/harness";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const CHANGE_RUNS_TEMP_PREFIX = "verify-change-runs-";
const MAIN_CHECKOUT_DIRECTORY = "product";
const GIT_FAILURE_EXIT_CODE = 1;
const BASE_COMMIT_MESSAGE = "Initialize change-runs fixture";
const HEAD_COMMIT_MESSAGE = "Add the verified file";

/** A run a test started: the selectors `start` received, the run token it reported, and the checkout it ran in. */
export interface StartedChangeRun {
  readonly runToken: string;
  readonly verificationType: VerifyVerificationType;
  readonly scopeType: VerifyScopeType;
  readonly scope: string;
  readonly cwd: string;
}

/** Which run to start: its verification type and scope type, the Change it serves, and the checkout to start it from. */
export interface ChangeRunRequest {
  readonly verificationType: VerifyVerificationType;
  readonly scopeType: VerifyScopeType;
  readonly change?: string;
  readonly cwd?: string;
}

/**
 * A real Git repository with a base commit and a head commit that adds the scenario's file, plus
 * the lifecycle operations a listing test drives. Every operation runs the production verify
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
  startRun(request: ChangeRunRequest): Promise<StartedChangeRun>;
  appendFindings(run: StartedChangeRun, findings: readonly FindingWithKey[]): Promise<void>;
  finish(run: StartedChangeRun, terminalStatus: string): Promise<void>;
  status(run: StartedChangeRun): Promise<VerifyStatusReport>;
  listChangeRuns(change: string, cwd?: string): Promise<CliCommandResult>;
}

function realGitDependencies(): GitDependencies {
  return {
    execa: async (command, args, options) => {
      const result = await execa(command, [...args], {
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        env: buildGitTestEnvironment(),
        extendEnv: false,
        reject: false,
      });
      return { exitCode: result.exitCode ?? GIT_FAILURE_EXIT_CODE, stdout: result.stdout, stderr: result.stderr };
    },
  };
}

function lifecycleDeps(cwd: string, inputContent: string): VerifyCliDeps {
  return {
    cwd,
    git: realGitDependencies(),
    processEnv: {},
    fs: defaultStateStoreFileSystem,
    readInputSource: async () => inputContent,
    readPayloadSource: (source: string) => Promise.resolve(source),
    journalBinding: { localSink: createRecordingStreamSink().sink },
  };
}

function listingDeps(cwd: string): VerifyChangeRunsDeps {
  return { cwd, git: realGitDependencies(), fs: defaultStateStoreFileSystem };
}

function requireOk(result: CliCommandResult, operation: string): CliCommandResult {
  if (result.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`change-runs harness: ${operation} failed: ${result.output}`);
  }
  return result;
}

async function initializeRepository(productDir: string, filePath: string): Promise<{
  readonly baseCommit: string;
  readonly headCommit: string;
}> {
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
  await runGit(productDir, [
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    BASE_COMMIT_MESSAGE,
  ]);
  const baseCommit = await readGit(productDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_REF.HEAD_NAME]);
  const absoluteFile = join(productDir, filePath);
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeFile(absoluteFile, HEAD_COMMIT_MESSAGE);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, filePath]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, HEAD_COMMIT_MESSAGE]);
  const headCommit = await readGit(productDir, [GIT_TEST_SUBCOMMANDS.REV_PARSE, GIT_TEST_REF.HEAD_NAME]);
  return { baseCommit, headCommit };
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
    const { baseCommit, headCommit } = await initializeRepository(productDir, scenario.filePath);
    const inputContent = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
    const lifecycleSelectors = (run: StartedChangeRun) => ({
      verificationType: run.verificationType,
      scopeType: run.scopeType,
      scope: run.scope,
      run: run.runToken,
    });
    const scopeFor = (scopeType: VerifyScopeType): string =>
      scopeType === VERIFY_SCOPE_TYPE.CHANGESET
        ? `${baseCommit}${VERIFY_SCOPE_SEPARATOR}${headCommit}`
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
      startRun: async (request) => {
        const cwd = request.cwd ?? productDir;
        const scope = scopeFor(request.scopeType);
        const started = requireOk(
          await verifyStartCommand(
            {
              verificationType: request.verificationType,
              scopeType: request.scopeType,
              scope,
              input: VERIFY_INPUT_SOURCE.STDIN,
              ...(request.change === undefined ? {} : { change: request.change }),
            },
            lifecycleDeps(cwd, inputContent),
          ),
          VERIFY_VERB.START,
        );
        return {
          runToken: (JSON.parse(started.output) as VerifyStartReport).runToken,
          verificationType: request.verificationType,
          scopeType: request.scopeType,
          scope,
          cwd,
        };
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
              lifecycleDeps(run.cwd, inputContent),
            ),
            VERIFY_VERB.APPEND_FINDING,
          );
        }
      },
      finish: async (run, terminalStatus) => {
        requireOk(
          await verifyFinishCommand(
            { ...lifecycleSelectors(run), terminalStatus },
            lifecycleDeps(run.cwd, inputContent),
          ),
          VERIFY_VERB.FINISH,
        );
      },
      status: async (run) => {
        const status = requireOk(
          await verifyStatusCommand(lifecycleSelectors(run), lifecycleDeps(run.cwd, inputContent)),
          VERIFY_VERB.STATUS,
        );
        return JSON.parse(status.output) as VerifyStatusReport;
      },
      listChangeRuns: (change, cwd) => verifyChangeRunsCommand({ change }, listingDeps(cwd ?? productDir)),
    };
    return callback(repository);
  });
}

/** Parse a successful listing's JSON report. */
export function parseChangeRunsReport(output: string): VerifyChangeRunsReport {
  return JSON.parse(output) as VerifyChangeRunsReport;
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
