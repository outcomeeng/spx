import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { execa } from "execa";

import { journalReadCommand } from "@/commands/journal/cli";
import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyPathsCommand,
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
import { GIT_DIR_BASENAME, GIT_ROOT_COMMAND, type GitDependencies } from "@/lib/git/root";
import { defaultStateStoreFileSystem, STATE_STORE_SCOPE_PATH } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  buildGitTestEnvironment,
  GIT_TEST_CONFIG,
  GIT_TEST_ENVIRONMENT_KEYS,
  GIT_TEST_FLAGS,
  GIT_TEST_SUBCOMMANDS,
  readGit,
  runGit,
} from "@testing/harnesses/git-test-constants";
import { createRecordingStreamSink, eventDataRecord } from "@testing/harnesses/verify/harness";
import { createTempDir, removeTempDir, withTempDir } from "@testing/harnesses/with-temp-dir";

const VERIFY_REPOSITORY_TEMP_PREFIX = "verify-repository-";
const GIT_FAILURE_EXIT_CODE = 1;
const BASE_COMMIT_MESSAGE = "Initialize verify repository fixture";
const HEAD_COMMIT_MESSAGE = "Add the verified file";
const GIT_TEST_WORKTREE_ADD = "add";

/** The two commits a verify repository fixture holds: an empty base commit and a head commit adding one file. */
export interface VerifyRepositoryCommits {
  readonly baseCommit: string;
  readonly headCommit: string;
}

/**
 * Git dependencies that run real `git` in a clean environment, reporting a missing exit code as a
 * failure. With `discoveryCeiling`, git's repository discovery stops before entering that directory,
 * so no repository at or above it is visible to the commands these dependencies run.
 */
export function realVerifyGitDependencies(discoveryCeiling?: string): GitDependencies {
  const env = discoveryCeiling === undefined
    ? buildGitTestEnvironment()
    : { ...buildGitTestEnvironment(), [GIT_TEST_ENVIRONMENT_KEYS.CEILING_DIRECTORIES]: discoveryCeiling };
  return {
    execa: async (command, args, options) => {
      const result = await execa(command, [...args], {
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        env,
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
  await runGit(productDir, [GIT_ROOT_COMMAND.CONFIG, GIT_TEST_CONFIG.EMAIL_KEY, GIT_TEST_CONFIG.EMAIL]);
  await runGit(productDir, [GIT_ROOT_COMMAND.CONFIG, GIT_TEST_CONFIG.USER_NAME_KEY, GIT_TEST_CONFIG.USER_NAME]);
  await runGit(productDir, [
    GIT_TEST_SUBCOMMANDS.COMMIT,
    GIT_TEST_FLAGS.ALLOW_EMPTY,
    GIT_TEST_FLAGS.COMMIT_MESSAGE,
    BASE_COMMIT_MESSAGE,
  ]);
  const baseCommit = await readGit(productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
  const absoluteFile = join(productDir, filePath);
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeFile(absoluteFile, HEAD_COMMIT_MESSAGE);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.ADD, filePath]);
  await runGit(productDir, [GIT_TEST_SUBCOMMANDS.COMMIT, GIT_TEST_FLAGS.COMMIT_MESSAGE, HEAD_COMMIT_MESSAGE]);
  const headCommit = await readGit(productDir, [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.HEAD]);
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

/** The `describe.each` title format that names one verification type. */
export const VERIFICATION_TYPE_CASE_TITLE = "verification type %s";

/** The kinds of entry a repository state snapshot records. */
export const REPOSITORY_STATE_ENTRY_KIND = {
  FILE: "file",
  DIRECTORY: "directory",
} as const;

export type RepositoryStateEntryKind = (typeof REPOSITORY_STATE_ENTRY_KIND)[keyof typeof REPOSITORY_STATE_ENTRY_KIND];

/**
 * One file or directory of a repository's checkout, at its canonical path with every symbolic link
 * resolved: its kind, its modification time, and, for a file, the digest of its content.
 */
export interface RepositoryStateEntry {
  readonly path: string;
  readonly kind: RepositoryStateEntryKind;
  readonly mtimeMs: number;
  readonly digest: string | undefined;
}

/**
 * Observe every file and directory of the checkout at `productDir`, the root included and the Git
 * directory excluded, following symbolic links so an entry below a link appears at its resolved path.
 * Entries are ordered by path.
 */
async function snapshotRepositoryState(productDir: string): Promise<readonly RepositoryStateEntry[]> {
  const root = await stat(productDir);
  const entries: RepositoryStateEntry[] = [
    { path: productDir, kind: REPOSITORY_STATE_ENTRY_KIND.DIRECTORY, mtimeMs: root.mtimeMs, digest: undefined },
  ];
  const visit = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      if (directory === productDir && name === GIT_DIR_BASENAME) continue;
      const canonical = await realpath(join(directory, name));
      const stats = await stat(canonical);
      if (stats.isDirectory()) {
        entries.push({
          path: canonical,
          kind: REPOSITORY_STATE_ENTRY_KIND.DIRECTORY,
          mtimeMs: stats.mtimeMs,
          digest: undefined,
        });
        await visit(canonical);
      } else {
        entries.push({
          path: canonical,
          kind: REPOSITORY_STATE_ENTRY_KIND.FILE,
          mtimeMs: stats.mtimeMs,
          digest: createHash("sha256").update(await readFile(canonical)).digest("hex"),
        });
      }
    }
  };
  await visit(productDir);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
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
  /**
   * Ask the production write-path report for the directories a run of `scopeType` and
   * `verificationType` writes, of a drawn verification type when none is given.
   */
  reportWritePaths(scopeType: string, verificationType?: string): Promise<CliCommandResult>;
  /** Observe every file and directory of the checkout, the Git directory excluded, at canonical paths. */
  snapshotState(): Promise<readonly RepositoryStateEntry[]>;
  /**
   * Replace the checkout's state store location with a symbolic link to an empty directory outside
   * the checkout, and return that directory's canonical path.
   */
  linkStateStore(): Promise<string>;
  /**
   * Add a linked Git worktree of this repository, outside the checkout and detached at the base
   * commit, and bind the production `start` and write-path report operations to run from it.
   */
  linkWorktree(): Promise<VerifyLinkedWorktree>;
}

/**
 * A linked Git worktree of a verify repository: `worktreeDir` is its canonical root, which differs
 * from the repository's checkout directory. `startRun` and `reportWritePaths` invoke the production
 * operations with the worktree as the working directory.
 */
export interface VerifyLinkedWorktree {
  readonly worktreeDir: string;
  startRun(scopeType: string, verificationType?: string): Promise<StartedRepositoryRun>;
  reportWritePaths(scopeType: string, verificationType?: string): Promise<CliCommandResult>;
}

/**
 * The production lifecycle bound to one product directory: `startRun`, which opens a run of the
 * given scope type and scope through the production `start` operation and observes its run-context
 * events, and `appendScope`, which records scope evidence on a started run through the production
 * `scope add` operation and observes the scope events the run's journal then holds.
 */
interface VerifyRunStarter {
  startRun(scopeType: string, scope: string, verificationType?: string): Promise<StartedRepositoryRun>;
  appendScope(run: StartedRepositoryRun, payload: JsonValue): Promise<AppendedRepositoryScope>;
  reportWritePaths(scopeType: string, scope: string, verificationType?: string): Promise<CliCommandResult>;
}

function createVerifyRunStarter(cwd: string, git: GitDependencies): VerifyRunStarter {
  const inputContent = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload()));
  const drawnVerificationType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType());
  const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const deps: VerifyCliDeps = {
    cwd,
    git,
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
  return {
    reportWritePaths: async (scopeType, scope, verificationType = drawnVerificationType) =>
      verifyPathsCommand({ verificationType, scopeType, scope }, deps),
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
    startRun: async (scopeType, scope, verificationType = drawnVerificationType) => {
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
  };
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
    const { appendScope, reportWritePaths, startRun } = createVerifyRunStarter(productDir, realVerifyGitDependencies());
    const scopeFor = (scopeType: string): string =>
      scopeType === VERIFY_SCOPE_TYPE.CHANGESET
        ? `${commits.baseCommit}${VERIFY_SCOPE_SEPARATOR}${layout.headBranch}`
        : layout.filePath;
    const linkedStoreDirectories: string[] = [];
    const linkedWorktreeDirectories: string[] = [];

    try {
      return await callback({
        productDir,
        filePath: layout.filePath,
        headBranch: layout.headBranch,
        ...commits,
        startRun: async (scopeType, verificationType) => startRun(scopeType, scopeFor(scopeType), verificationType),
        appendScope,
        writeCheckoutFile: async (path) => {
          const absoluteFile = join(productDir, path);
          await mkdir(dirname(absoluteFile), { recursive: true });
          await writeFile(absoluteFile, path);
        },
        reportWritePaths: async (scopeType, verificationType) =>
          reportWritePaths(scopeType, scopeFor(scopeType), verificationType),
        snapshotState: async () => snapshotRepositoryState(productDir),
        linkStateStore: async () => {
          const createdDirectory = await createTempDir(VERIFY_REPOSITORY_TEMP_PREFIX);
          linkedStoreDirectories.push(createdDirectory);
          const storeDirectory = await realpath(createdDirectory);
          await symlink(storeDirectory, join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR));
          return storeDirectory;
        },
        linkWorktree: async () => {
          const createdDirectory = await createTempDir(VERIFY_REPOSITORY_TEMP_PREFIX);
          linkedWorktreeDirectories.push(createdDirectory);
          const worktreeDir = await realpath(createdDirectory);
          await runGit(productDir, [
            GIT_TEST_SUBCOMMANDS.WORKTREE,
            GIT_TEST_WORKTREE_ADD,
            GIT_TEST_FLAGS.DETACH,
            worktreeDir,
            commits.baseCommit,
          ]);
          const linked = createVerifyRunStarter(worktreeDir, realVerifyGitDependencies());
          return {
            worktreeDir,
            startRun: async (scopeType, verificationType) =>
              linked.startRun(scopeType, scopeFor(scopeType), verificationType),
            reportWritePaths: async (scopeType, verificationType) =>
              linked.reportWritePaths(scopeType, scopeFor(scopeType), verificationType),
          };
        },
      });
    } finally {
      await Promise.all(
        linkedWorktreeDirectories.map(async (directory) => removeTempDir(directory).catch(() => {})),
      );
      await Promise.all(linkedStoreDirectories.map(async (directory) => removeTempDir(directory).catch(() => {})));
    }
  });
}

/**
 * A temporary directory that no Git repository encloses. The git dependencies its runs use bound
 * repository discovery at the directory itself — git never searches its parent or anything above —
 * so the directory's own entries are the only place a repository could be found. `gitEntries` lists
 * the directory's entries named like a Git directory, read before any run starts; `startFileRun` opens
 * a file-scope run on `filePath` through the production `start` operation with those dependencies, and
 * `appendScope` records scope evidence on such a run through the production `scope add` operation.
 */
export interface VerifyOutsideRepositoryDirectory {
  readonly productDir: string;
  readonly filePath: string;
  readonly gitEntries: readonly string[];
  /** Start a file-scope run, of `verificationType` when given and of a drawn verification type otherwise. */
  startFileRun(verificationType?: string): Promise<StartedRepositoryRun>;
  /** Append `payload` as scope evidence to a started run through the production `scope add` operation. */
  appendScope(run: StartedRepositoryRun, payload: JsonValue): Promise<AppendedRepositoryScope>;
}

/**
 * Create a directory outside any Git repository in a temporary directory and hand it to the callback.
 * The directory and every run recorded under its `.spx/` store are removed when the callback settles.
 */
export async function withVerifyOutsideRepositoryDirectory<T>(
  callback: (directory: VerifyOutsideRepositoryDirectory) => Promise<T>,
): Promise<T> {
  return withTempDir(VERIFY_REPOSITORY_TEMP_PREFIX, async (tempDir) => {
    const productDir = await realpath(tempDir);
    const layout = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.headCommitRepository());
    const gitEntries = (await readdir(productDir)).filter((entry) => entry === GIT_DIR_BASENAME);
    const { appendScope, startRun } = createVerifyRunStarter(
      productDir,
      realVerifyGitDependencies(dirname(productDir)),
    );
    return callback({
      productDir,
      filePath: layout.filePath,
      gitEntries,
      startFileRun: async (verificationType) => startRun(VERIFY_SCOPE_TYPE.FILE, layout.filePath, verificationType),
      appendScope,
    });
  });
}

/**
 * A real Git repository initialized with `git init` that holds no commit, so its HEAD names a branch
 * no commit exists for. Its git dependencies bound repository discovery at the repository itself.
 * `headVerifyExitCode` is the exit code `git rev-parse --verify HEAD` reported in the repository,
 * read before any run starts; `startFileRun` opens a file-scope run on `filePath` through the
 * production `start` operation.
 */
export interface VerifyUnbornHeadRepository {
  readonly productDir: string;
  readonly filePath: string;
  readonly headVerifyExitCode: number;
  /** Start a file-scope run, of `verificationType` when given and of a drawn verification type otherwise. */
  startFileRun(verificationType?: string): Promise<StartedRepositoryRun>;
}

/**
 * Create the unborn-HEAD repository in a temporary directory and hand it to the callback. The
 * directory and every run recorded under its `.spx/` store are removed when the callback settles.
 */
export async function withVerifyUnbornHeadRepository<T>(
  callback: (repository: VerifyUnbornHeadRepository) => Promise<T>,
): Promise<T> {
  return withTempDir(VERIFY_REPOSITORY_TEMP_PREFIX, async (tempDir) => {
    const productDir = await realpath(tempDir);
    const layout = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.headCommitRepository());
    await runGit(productDir, [GIT_TEST_SUBCOMMANDS.INIT]);
    const git = realVerifyGitDependencies(dirname(productDir));
    const headVerify = await git.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [GIT_ROOT_COMMAND.REV_PARSE, GIT_ROOT_COMMAND.VERIFY, GIT_ROOT_COMMAND.HEAD],
      { cwd: productDir },
    );
    const { startRun } = createVerifyRunStarter(productDir, git);
    return callback({
      productDir,
      filePath: layout.filePath,
      headVerifyExitCode: headVerify.exitCode,
      startFileRun: async (verificationType) => startRun(VERIFY_SCOPE_TYPE.FILE, layout.filePath, verificationType),
    });
  });
}
