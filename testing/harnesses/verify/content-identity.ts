/**
 * Harness for the content identity of a verification run's recorded input: it starts runs over
 * input bytes, replays them against a checked file, and returns what happened. It owns the
 * input-reader and check-file-reader doubles and the in-memory run state; the linked tests own every
 * predicate.
 */
import { join, resolve } from "node:path";

import {
  VERIFY_CLI_EXIT_CODE,
  type VerifyCliDeps,
  type VerifyInputCheckReport,
  type VerifyInputCliOptions,
  verifyInputCommand,
  type VerifyStartCliOptions,
  verifyStartCommand,
  type VerifyStartReport,
} from "@/commands/verify/cli";
import type { CliCommandResult } from "@/config/types";
import type { RecordedInput } from "@/domains/verify/verify";
import { STATE_STORE_SCOPE_PATH, STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

import {
  createVerifyRunContextScenario,
  parseStartReport,
  verifyDeps,
  verifyInputOptions,
  verifyInputRecordFilePath,
  type VerifyRunContextScenario,
  verifyStartOptions,
} from "./harness";

const ENOENT = "ENOENT";

/** The content-identity options a `start` request can carry. */
export interface StartContentOptions {
  readonly expectedContentSha256?: string;
  readonly contentNormalization?: string;
}

export interface StartObservation {
  readonly scenario: VerifyRunContextScenario;
  readonly command: CliCommandResult;
  /** The start report, present only when `start` succeeded. */
  readonly report: VerifyStartReport | undefined;
  /** The recorded-input sidecar the run persisted, present only when `start` succeeded. */
  readonly recordedInput: RecordedInput | undefined;
  /** Whether any run state exists under the product's state root. */
  readonly stateRootExists: boolean;
}

async function readRecordedInput(
  scenario: VerifyRunContextScenario,
  runToken: string,
  fs: ReturnType<typeof createInMemoryStateStoreFileSystem>,
): Promise<RecordedInput> {
  const content = await fs.readFile(verifyInputRecordFilePath(scenario, runToken), STATE_STORE_TEXT_ENCODING);
  return JSON.parse(content) as RecordedInput;
}

/** Start a run whose input reader returns `bytes`, with the content-identity options given. */
export async function observeStartOverInputBytes(
  bytes: Uint8Array,
  contentOptions: StartContentOptions = {},
): Promise<StartObservation> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const options: VerifyStartCliOptions = { ...verifyStartOptions(scenario), ...contentOptions };
  const command = await verifyStartCommand(options, verifyDeps(scenario, fs, { inputBytes: bytes }));
  const report = command.exitCode === VERIFY_CLI_EXIT_CODE.OK ? parseStartReport(command.output) : undefined;
  return {
    scenario,
    command,
    report,
    recordedInput: report === undefined ? undefined : await readRecordedInput(scenario, report.runToken, fs),
    stateRootExists: await fs.lstat(join(scenario.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR)).then(
      () => true,
      () => false,
    ),
  };
}

/** A file a replay checks: its product-relative name and its bytes, or `undefined` bytes when it cannot be read. */
export interface CheckedFile {
  readonly path: string;
  readonly bytes: Uint8Array | undefined;
}

/**
 * The check-file reader double: it returns the file's bytes only for the path the file's name
 * resolves to against the invocation directory, and fails as a missing file for any other path
 * and for a file declared unreadable (Stage-5 exception 1, failure simulation).
 */
function createCheckFileReader(invocationDir: string, file: CheckedFile | undefined): VerifyCliDeps["readCheckFile"] {
  const resolvedPath = file === undefined ? undefined : resolve(invocationDir, file.path);
  return async (path: string) => {
    if (file?.bytes !== undefined && path === resolvedPath) return file.bytes;
    throw Object.assign(new Error(`${ENOENT}: no such file ${path}`), { code: ENOENT });
  };
}

export interface InputCheckRequest {
  /** The bytes the run's input reader returns at start. */
  readonly recordedBytes: Uint8Array;
  readonly checkedFile?: CheckedFile;
  readonly contentNormalization?: string;
  /** Rewrite the recorded-input sidecar without its content digests, as a run started before they were recorded holds it. */
  readonly omitRecordedContentDigests?: boolean;
}

export interface InputCheckObservation {
  readonly scenario: VerifyRunContextScenario;
  readonly startReport: VerifyStartReport;
  readonly recordedInput: RecordedInput;
  readonly command: CliCommandResult;
}

/** Start a run over `recordedBytes`, then replay its input with the check request given. */
export async function observeInputCheck(request: InputCheckRequest): Promise<InputCheckObservation> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs, {
    inputBytes: request.recordedBytes,
    readCheckFile: createCheckFileReader(scenario.productDir, request.checkedFile),
  });
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`content-identity harness: the run did not start: ${started.output}`);
  }
  const startReport = parseStartReport(started.output);
  if (request.omitRecordedContentDigests === true) {
    const { contentDigests: _omitted, ...withoutDigests } = await readRecordedInput(scenario, startReport.runToken, fs);
    await fs.writeFile(verifyInputRecordFilePath(scenario, startReport.runToken), JSON.stringify(withoutDigests));
  }
  const options: VerifyInputCliOptions = {
    ...verifyInputOptions(scenario, startReport.runToken),
    ...(request.checkedFile === undefined ? {} : { checkFile: request.checkedFile.path }),
    ...(request.contentNormalization === undefined ? {} : { contentNormalization: request.contentNormalization }),
  };
  return {
    scenario,
    startReport,
    recordedInput: await readRecordedInput(scenario, startReport.runToken, fs),
    command: await verifyInputCommand(options, deps),
  };
}

export function parseInputCheckReport(output: string): VerifyInputCheckReport {
  return JSON.parse(output) as VerifyInputCheckReport;
}
