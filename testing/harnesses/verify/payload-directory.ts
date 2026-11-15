import { chmod, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { journalAppendCommand, journalSealCommand } from "@/commands/journal/cli";
import type { JournalStreamSink } from "@/commands/journal/runtime";
import {
  VERIFY_CLI_ENV,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  verifyStartCommand,
  type VerifyStartReport,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  buildTerminalEvent,
  VERIFY_PAYLOAD_PATH,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyVerificationType,
} from "@/domains/verify/verify";
import { defaultStateStoreFileSystem, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  realVerifyGitDependencies,
  type VerifyHeadCommitRepository,
  withVerifyHeadCommitRepository,
} from "@testing/harnesses/verify/repository";

const PAYLOAD_FILE_EXTENSION = ".json";
const READ_ONLY_DIRECTORY_MODE = 0o555;
const WRITABLE_DIRECTORY_MODE = 0o755;

/** A generated name for a payload file, distinct on each draw. */
export function samplePayloadFileName(): string {
  return `${sampleDistinctToken()}${PAYLOAD_FILE_EXTENSION}`;
}

/** A generated name for a directory, distinct on each draw. */
export function sampleDirectoryName(): string {
  return sampleDistinctToken();
}

/** A generated branch name, distinct on each draw. */
export function sampleBranchName(): string {
  return sampleDistinctToken();
}

let distinctTokenDraws = 0;

/**
 * A generated scope token suffixed with the draw count, so two draws in one process never collide even
 * when the generator repeats a value.
 */
function sampleDistinctToken(): string {
  distinctTokenDraws += 1;
  return `${sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken())}-${distinctTokenDraws.toString()}`;
}

/**
 * Make `directory` read-only for the callback, so no entry inside it can be removed or added, and restore
 * its write permission when the callback settles.
 */
export async function withReadOnlyDirectory<T>(directory: string, callback: () => Promise<T>): Promise<T> {
  await chmod(directory, READ_ONLY_DIRECTORY_MODE);
  try {
    return await callback();
  } finally {
    await chmod(directory, WRITABLE_DIRECTORY_MODE);
  }
}

/** Read a payload file as the CLI does. */
export async function readPayloadFile(path: string): Promise<string> {
  return readFile(path, STATE_STORE_TEXT_ENCODING);
}

/** Whether `path` names a directory that exists. */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Create an empty payload directory named for a run no journal names, inside the payload root of `run`, and return its path. */
export async function stageUnjournaledPayloadDirectory(run: PayloadRun): Promise<string> {
  const directory = join(
    dirname(run.report?.payloadDirectory ?? ""),
    `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${sampleDirectoryName()}`,
  );
  await mkdir(directory);
  return directory;
}

/** Write `content` as a generated file name in `run`'s payload directory, and return that run-relative name. */
export async function stageRunPayload(run: PayloadRun, content: string): Promise<string> {
  const name = samplePayloadFileName();
  await writeFile(join(run.report?.payloadDirectory ?? "", name), content);
  return name;
}

/**
 * Stage `content` in a file of `productDir` outside `run`'s payload directory, plus a symbolic link to it
 * inside the payload directory, and return the outside file's absolute path and the link's run-relative
 * name.
 */
export async function stageEscapingPayload(
  productDir: string,
  run: PayloadRun,
  content: string,
): Promise<{ readonly outsidePath: string; readonly linkName: string }> {
  const outsidePath = join(productDir, samplePayloadFileName());
  await writeFile(outsidePath, content);
  const linkName = samplePayloadFileName();
  await symlink(outsidePath, join(run.report?.payloadDirectory ?? "", linkName));
  return { outsidePath, linkName };
}

/** A stream sink that receives each appended event and keeps none: the payload evidence reads the journal back instead. */
const discardingStreamSink: JournalStreamSink = {
  emit: async () => undefined,
};

/** The selectors every existing-run command of one run takes. */
export interface PayloadRunSelectors {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

/**
 * One run started through the production `start` over the repository's file: the `start` result, the
 * report it carries when it succeeded, and the selectors that address the run afterward. The harness
 * returns the result without a verdict; the caller judges it.
 */
export interface PayloadRun {
  readonly started: CliCommandResult;
  readonly report: VerifyStartReport | undefined;
  readonly selectors: PayloadRunSelectors;
  /** The branch the run was started under, when it names one other than the checkout's. */
  readonly branch?: string;
}

/** How a payload-directory run is started: its verification type, its branch, and the lifecycle dependencies to apply. */
export interface PayloadRunStart {
  readonly verificationType?: VerifyVerificationType;
  readonly branch?: string;
  readonly deps?: Partial<VerifyCliDeps>;
}

/**
 * A real Git repository for the payload-directory lifecycle, and the production lifecycle bound to it.
 * `deps` reads the run input as generated bytes and every evidence or terminal-metadata source from the
 * file system, as the CLI does, so a run-relative payload is read from the file a name resolves to. Every
 * operation returns the production result without a verdict.
 */
export interface PayloadDirectoryRepository {
  readonly repository: VerifyHeadCommitRepository;
  /** The production lifecycle dependencies rooted at the checkout, with `overrides` applied. */
  deps(overrides?: Partial<VerifyCliDeps>): VerifyCliDeps;
  /** Lifecycle dependencies whose payload-directory removal refuses with a generated reason. */
  refusingRemovalDeps(): VerifyCliDeps;
  /** Start a file-scoped run of the repository's file, a review run unless another type is named. */
  startRun(start?: PayloadRunStart): Promise<PayloadRun>;
  /** Record one generated scope unit on `run` through the production `scope add` with an inline `--payload`. */
  addScopeUnit(run: PayloadRun): Promise<CliCommandResult>;
  /** Append a terminal-completion event to `run`'s journal through the production event builder, leaving it unsealed. */
  recordTerminalEventOnly(run: PayloadRun): Promise<CliCommandResult>;
  /** Seal `run`'s journal through the journal substrate without recording terminal completion. */
  sealOnly(run: PayloadRun): Promise<CliCommandResult>;
  /** Read `run`'s status through the production `status`. */
  status(run: PayloadRun): Promise<CliCommandResult>;
}

/**
 * Create a head-commit repository in a temporary directory and hand the payload-directory lifecycle
 * bound to it to the callback. The directory and every run recorded under its `.spx/` store are removed
 * when the callback settles.
 */
export async function withPayloadDirectoryRepository<T>(
  callback: (payloads: PayloadDirectoryRepository) => Promise<T>,
): Promise<T> {
  const input = new TextEncoder().encode(JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())));
  return withVerifyHeadCommitRepository(async (repository) => {
    const deps = (overrides: Partial<VerifyCliDeps> = {}): VerifyCliDeps => ({
      cwd: repository.productDir,
      git: realVerifyGitDependencies(),
      processEnv: {},
      fs: defaultStateStoreFileSystem,
      readInputSource: async () => input,
      readPayloadSource: readPayloadFile,
      journalBinding: { localSink: discardingStreamSink },
      ...overrides,
    });
    const branchDeps = (branch: string | undefined, overrides: Partial<VerifyCliDeps> = {}): VerifyCliDeps =>
      deps({ ...overrides, ...(branch === undefined ? {} : { processEnv: { [VERIFY_CLI_ENV.BRANCH]: branch } }) });
    const journalScope = (run: PayloadRun) => ({ type: run.selectors.verificationType, runToken: run.selectors.run });
    return callback({
      repository,
      deps,
      refusingRemovalDeps: () =>
        deps({
          removePayloadDirectory: async () => {
            throw new Error(sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken()));
          },
        }),
      startRun: async ({ verificationType = VERIFY_VERIFICATION_TYPE.REVIEW, branch, deps: overrides } = {}) => {
        const started = await verifyStartCommand(
          {
            verificationType,
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scope: repository.filePath,
            input: repository.filePath,
          },
          branchDeps(branch, overrides),
        );
        const report = started.exitCode === 0 ? (JSON.parse(started.output) as VerifyStartReport) : undefined;
        return {
          started,
          report,
          selectors: {
            verificationType,
            scopeType: VERIFY_SCOPE_TYPE.FILE,
            scope: repository.filePath,
            run: report?.runToken ?? "",
          },
          ...(branch === undefined ? {} : { branch }),
        };
      },
      addScopeUnit: async (run) =>
        verifyAppendScopeCommand(
          {
            ...run.selectors,
            payload: JSON.stringify(
              sampleVerifyTestValue(
                VERIFY_TEST_GENERATOR.unjudgedScopeUnit(
                  run.selectors.verificationType as VerifyVerificationType,
                  repository.filePath,
                ),
              ),
            ),
            idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
          },
          branchDeps(run.branch, { readPayloadSource: async (source) => source }),
        ),
      recordTerminalEventOnly: async (run) =>
        journalAppendCommand(
          journalScope(run),
          buildTerminalEvent({
            runToken: run.selectors.run,
            terminalStatus: JOURNAL_RUN_STATE_STATUS.INTERRUPTED,
            at: new Date(),
          }),
          { localSink: discardingStreamSink },
          branchDeps(run.branch),
        ),
      sealOnly: async (run) => journalSealCommand(journalScope(run), branchDeps(run.branch)),
      status: async (run) => verifyStatusCommand(run.selectors, branchDeps(run.branch)),
    });
  });
}
