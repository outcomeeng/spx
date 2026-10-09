import { mkdir, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";

import { journalReadCommand } from "@/commands/journal/cli";
import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyStartCommand,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import {
  VERIFY_APPEND_EVENT_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_INPUT_SOURCE,
  VERIFY_RUN_CONTEXT_EVENT_TYPE,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
} from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import type { GitDependencies } from "@/lib/git/root";
import { defaultStateStoreFileSystem } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_FLAGS,
  GIT_TEST_REF,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createRecordingStreamSink, eventDataRecord } from "@testing/harnesses/verify/harness";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const VERIFY_REPOSITORY_TEMP_PREFIX = "verify-repository-";
const GIT_FAILURE_EXIT_CODE = 1;
const BASE_COMMIT_MESSAGE = "Initialize verify repository fixture";
const HEAD_COMMIT_MESSAGE = "Add the verified file";

/** The two commits a verify repository fixture holds: an empty base commit and a head commit adding one file. */
export interface VerifyRepositoryCommits {
  readonly baseCommit: string;
  readonly headCommit: string;
}

/** Git dependencies that run real `git` in a clean environment, reporting a missing exit code as a failure. */
export function realVerifyGitDependencies(): GitDependencies {
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

/**
 * Initialize a real Git repository in `productDir` with an empty base commit and a head commit that
 * adds `filePath`, and return both commits as Git reported them when they were created.
 */
export async function initializeVerifyRepository(
  productDir: string,
  filePath: string,
): Promise<VerifyRepositoryCommits> {
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
 * What one `start` produced: the selector it was invoked with, the command result, and, when it
 * succeeded, the run token it reported and the data of the run's run-context events.
 */
export interface StartedRepositoryRun {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly started: CliCommandResult;
  readonly runToken: string | undefined;
  readonly runContextData: readonly Readonly<Record<string, unknown>>[];
}

/** What one `scope add` produced: the command result and the payload of every scope event the run's journal then holds. */
export interface AppendedRepositoryScope {
  readonly appended: CliCommandResult;
  readonly scopePayloads: readonly JsonValue[];
}

/**
 * A real Git repository whose checkout is detached at the base commit while the head commit stays
 * reachable through the branch `headBranch`, so the commit a changeset range names differs from the
 * checkout's HEAD. `startRun` opens a run of the given scope type through the production `start`
 * operation — a changeset scope as `<baseCommit>..<headBranch>`, a file scope as `filePath` — and
 * returns the run-context events the run's journal holds; `appendScope` records scope evidence on
 * such a run through the production `scope add` operation and returns the scope events the journal
 * then holds.
 */
export interface VerifyHeadCommitRepository extends VerifyRepositoryCommits {
  readonly productDir: string;
  readonly filePath: string;
  readonly headBranch: string;
  /** Start a run of `scopeType`, of `verificationType` when given and of a drawn verification type otherwise. */
  startRun(scopeType: string, verificationType?: string): Promise<StartedRepositoryRun>;
  /** Append `payload` as scope evidence to a started run through the production `scope add` operation. */
  appendScope(run: StartedRepositoryRun, payload: JsonValue): Promise<AppendedRepositoryScope>;
  /** Write a file at the product-relative `path` into the checkout without adding it to any commit. */
  writeCheckoutFile(path: string): Promise<void>;
}

/**
 * Create the head-commit repository in a temporary directory and hand it to the callback. The
 * directory and every run recorded under its `.spx/` store are removed when the callback settles.
 */
export async function withVerifyHeadCommitRepository<T>(
  callback: (repository: VerifyHeadCommitRepository) => Promise<T>,
): Promise<T> {
  return withTempDir(VERIFY_REPOSITORY_TEMP_PREFIX, async (tempDir) => {
    const productDir = await realpath(tempDir);
    const layout = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.headCommitRepository());
    const commits = await initializeVerifyRepository(productDir, layout.filePath);
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.CHECKOUT, GIT_TEST_FLAGS.DETACH, commits.baseCommit]);
    // Forced, because the drawn branch name may coincide with the default branch the commits landed on.
    await runGit(productDir, [
      GIT_TEST_SUBCOMMANDS.BRANCH,
      GIT_TEST_FLAGS.FORCE,
      layout.headBranch,
      commits.headCommit,
    ]);
    const inputContent = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
    const drawnVerificationType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType());
    const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const deps: VerifyCliDeps = {
      cwd: productDir,
      git: realVerifyGitDependencies(),
      processEnv: {},
      fs: defaultStateStoreFileSystem,
      readInputSource: async () => inputContent,
      readPayloadSource: async (source) => source,
      journalBinding: { localSink: createRecordingStreamSink().sink },
    };
    const readRunEvents = async (verificationType: string, runToken: string): Promise<readonly JournalEvent[]> => {
      const read = await journalReadCommand({ type: verificationType, runToken }, String(JOURNAL_SEQ_BASE), deps);
      if (read.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
        throw new Error(`verify repository harness: journal read failed: ${read.output}`);
      }
      return JSON.parse(read.output) as readonly JournalEvent[];
    };
    const scopeFor = (scopeType: string): string =>
      scopeType === VERIFY_SCOPE_TYPE.CHANGESET
        ? `${commits.baseCommit}${VERIFY_SCOPE_SEPARATOR}${layout.headBranch}`
        : layout.filePath;

    return callback({
      productDir,
      filePath: layout.filePath,
      headBranch: layout.headBranch,
      ...commits,
      startRun: async (scopeType, verificationType = drawnVerificationType) => {
        const scope = scopeFor(scopeType);
        const started = await verifyStartCommand(
          { verificationType, scopeType, scope, input: VERIFY_INPUT_SOURCE.STDIN },
          deps,
        );
        const selector = { verificationType, scopeType, scope, started };
        if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
          return { ...selector, runToken: undefined, runContextData: [] };
        }
        const { runToken } = JSON.parse(started.output) as VerifyStartReport;
        return {
          ...selector,
          runToken,
          runContextData: (await readRunEvents(verificationType, runToken))
            .filter((event) => event.type === VERIFY_RUN_CONTEXT_EVENT_TYPE)
            .map(eventDataRecord),
        };
      },
      appendScope: async (run, payload) => {
        if (run.runToken === undefined) {
          throw new Error(`verify repository harness: scope add needs a started run: ${run.started.output}`);
        }
        const appended = await verifyAppendScopeCommand(
          {
            verificationType: run.verificationType,
            scopeType: run.scopeType,
            scope: run.scope,
            run: run.runToken,
            payload: JSON.stringify(payload),
            idempotencyKey,
          },
          deps,
        );
        return {
          appended,
          scopePayloads: (await readRunEvents(run.verificationType, run.runToken))
            .filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)
            .map((event) => eventDataRecord(event)[VERIFY_APPEND_EVENT_FIELD.PAYLOAD] as JsonValue),
        };
      },
      writeCheckoutFile: async (path) => {
        const absoluteFile = join(productDir, path);
        await mkdir(dirname(absoluteFile), { recursive: true });
        await writeFile(absoluteFile, path);
      },
    });
  });
}
