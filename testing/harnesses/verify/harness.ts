import { join } from "node:path";

import { type JournalCliDeps, journalReadCommand } from "@/commands/journal/cli";
import type { JournalStreamSink } from "@/commands/journal/runtime";
import {
  VERIFY_CLI_EXIT_CODE,
  type VerifyAppendCliOptions,
  verifyAppendFindingCommand,
  type VerifyAppendReport,
  type VerifyCliDeps,
  type VerifyFinishCliOptions,
  verifyFinishCommand,
  type VerifyFinishReport,
  type VerifyInputCliOptions,
  type VerifyInputReport,
  type VerifyRenderCliOptions,
  type VerifyRenderReport,
  type VerifyStartCliOptions,
  verifyStartCommand,
  type VerifyStartReport,
  type VerifyStatusCliOptions,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import { VERIFY_INPUT_SOURCE, VERIFY_SCOPE_SEPARATOR, VERIFY_SCOPE_TYPE } from "@/domains/verify/verify";
import {
  type ExecResult,
  GIT_COMMON_DIR_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_DIR_BASENAME,
  GIT_HEAD_SHA_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  type GitDependencies,
} from "@/git/root";
import { JOURNAL_SEQ_BASE, type JournalEvent } from "@/lib/agent-run-journal";
import { GIT_NAME_STATUS_FLAG } from "@/lib/git/name-status";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  type FindingWithKey,
  formatNameStatusZ,
  sampleVerifyTestValue,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";

const GIT_UNEXPECTED_COMMAND: ExecResult = {
  exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
  stdout: "",
  stderr: "verify harness: unexpected git command",
};

export type VerifyStateStoreFileSystem = ReturnType<typeof createInMemoryStateStoreFileSystem>;

export interface VerifyRunContextScenario {
  readonly verificationType: string;
  readonly base: string;
  readonly head: string;
  readonly scope: string;
  readonly changedPaths: readonly string[];
  readonly nameStatusStdout: string;
  readonly inputContent: string;
  readonly branchIdentity: string;
  readonly headSha: string;
  readonly productDir: string;
  readonly launchedAt: Date;
}

export function createVerifyRunContextScenario(): VerifyRunContextScenario {
  const range = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changesetRange());
  const changedPaths = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changedPaths());
  return {
    verificationType: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.verificationType()),
    base: range.base,
    head: range.head,
    scope: `${range.base}${VERIFY_SCOPE_SEPARATOR}${range.head}`,
    changedPaths,
    nameStatusStdout: formatNameStatusZ(changedPaths),
    inputContent: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())),
    branchIdentity: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.branchIdentity()),
    headSha: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.headSha()),
    productDir: sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot()),
    launchedAt: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.launchedAt()),
  };
}

export function withChangedPaths(
  scenario: VerifyRunContextScenario,
  changedPaths: readonly string[],
): VerifyRunContextScenario {
  return { ...scenario, changedPaths, nameStatusStdout: formatNameStatusZ(changedPaths) };
}

export function withScope(
  scenario: VerifyRunContextScenario,
  base: string,
  head: string,
): VerifyRunContextScenario {
  return { ...scenario, base, head, scope: `${base}${VERIFY_SCOPE_SEPARATOR}${head}` };
}

export function withVerificationType(
  scenario: VerifyRunContextScenario,
  verificationType: string,
): VerifyRunContextScenario {
  return { ...scenario, verificationType };
}

export async function startReportFor(scenario: VerifyRunContextScenario): Promise<VerifyStartReport> {
  const fs = createInMemoryStateStoreFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  return parseStartReport(started.output);
}

export function verifyStartOptions(scenario: VerifyRunContextScenario): VerifyStartCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    input: VERIFY_INPUT_SOURCE.STDIN,
  };
}

export function verifyInputOptions(scenario: VerifyRunContextScenario, runToken: string): VerifyInputCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    run: runToken,
  };
}

function gitSuccess(stdout: string): ExecResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, stdout, stderr: "" };
}

export function verifyGitDeps(scenario: VerifyRunContextScenario): GitDependencies {
  return {
    execa: async (_command, args) => {
      const argLine = args.join(" ");
      if (argLine === GIT_SHOW_TOPLEVEL_ARGS.join(" ")) return gitSuccess(scenario.productDir);
      if (argLine === GIT_COMMON_DIR_ARGS.join(" ")) return gitSuccess(join(scenario.productDir, GIT_DIR_BASENAME));
      if (argLine === GIT_CURRENT_BRANCH_ARGS.join(" ")) return gitSuccess(scenario.branchIdentity);
      if (argLine === GIT_HEAD_SHA_ARGS.join(" ")) return gitSuccess(scenario.headSha);
      if (args.includes(GIT_NAME_STATUS_FLAG)) return gitSuccess(scenario.nameStatusStdout);
      return GIT_UNEXPECTED_COMMAND;
    },
  };
}

export function verifyDeps(scenario: VerifyRunContextScenario, fs: VerifyStateStoreFileSystem): VerifyCliDeps {
  return {
    cwd: scenario.productDir,
    fs,
    git: verifyGitDeps(scenario),
    processEnv: {},
    now: () => scenario.launchedAt,
    readInputSource: async () => scenario.inputContent,
  };
}

export function parseStartReport(output: string): VerifyStartReport {
  return JSON.parse(output) as VerifyStartReport;
}

export function parseInputReport(output: string): VerifyInputReport {
  return JSON.parse(output) as VerifyInputReport;
}

export interface RecordingInputReader {
  /** A `readInputSource` capability that records each invocation; the input verb must never call it. */
  readonly read: (source: string) => Promise<string>;
  /** How many times `read` has been invoked. */
  calls(): number;
}

/**
 * A recording input-reader double (Stage-5 exception 2, interaction protocol): it counts calls
 * and echoes the source it was handed, so a test can prove the input verb replays the recorded
 * input without ever reading a fresh source — by asserting the reader was called zero times.
 */
export function createRecordingInputReader(): RecordingInputReader {
  let count = 0;
  return {
    read: (source: string) => {
      count += 1;
      return Promise.resolve(source);
    },
    calls: () => count,
  };
}

export function verifyAppendOptions(
  scenario: VerifyRunContextScenario,
  args: { readonly run: string; readonly payload: string; readonly idempotencyKey: string },
): VerifyAppendCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    run: args.run,
    payload: args.payload,
    idempotencyKey: args.idempotencyKey,
  };
}

export interface RecordingStreamSink {
  /** A journal streaming sink that records each emitted event for boundary observation. */
  readonly sink: JournalStreamSink;
  /** The events streamed through the sink, oldest first. */
  events(): readonly JournalEvent[];
}

/**
 * A recording stream-sink double (Stage-5 exception 6, observability): it captures each event
 * the append verb streams so a test can observe the streamed evidence without a real terminal
 * or pull-request comment.
 */
export function createRecordingStreamSink(): RecordingStreamSink {
  const events: JournalEvent[] = [];
  return {
    sink: {
      emit: (event: JournalEvent): Promise<void> => {
        events.push(event);
        return Promise.resolve();
      },
    },
    events: () => events,
  };
}

export function verifyAppendDeps(
  scenario: VerifyRunContextScenario,
  fs: VerifyStateStoreFileSystem,
  sink: JournalStreamSink,
): VerifyCliDeps {
  return {
    ...verifyDeps(scenario, fs),
    readPayloadSource: (source: string) => Promise.resolve(source),
    journalBinding: { localSink: sink },
  };
}

export interface VerifyAppendScenarioEnv {
  readonly scenario: VerifyRunContextScenario;
  readonly fs: VerifyStateStoreFileSystem;
  readonly sink: RecordingStreamSink;
  readonly deps: VerifyCliDeps;
}

/** Compose an append fixture: a fresh in-memory store, a recording stream sink, and wired deps for one scenario. */
export function createVerifyAppendScenario(scenario: VerifyRunContextScenario): VerifyAppendScenarioEnv {
  const fs = createInMemoryStateStoreFileSystem();
  const sink = createRecordingStreamSink();
  const deps = verifyAppendDeps(scenario, fs, sink.sink);
  return { scenario, fs, sink, deps };
}

function journalDepsFor(scenario: VerifyRunContextScenario, fs: VerifyStateStoreFileSystem): JournalCliDeps {
  return {
    cwd: scenario.productDir,
    fs,
    git: verifyGitDeps(scenario),
    processEnv: {},
    now: () => scenario.launchedAt,
  };
}

/** Read every persisted event for a run through the real journal substrate over the in-memory store. */
export async function readVerifyRunEvents(
  scenario: VerifyRunContextScenario,
  runToken: string,
  fs: VerifyStateStoreFileSystem,
): Promise<readonly JournalEvent[]> {
  const read = await journalReadCommand(
    { type: scenario.verificationType, runToken },
    String(JOURNAL_SEQ_BASE),
    journalDepsFor(scenario, fs),
  );
  if (read.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify harness: journal read failed: ${read.output}`);
  }
  return JSON.parse(read.output) as readonly JournalEvent[];
}

export function parseAppendReport(output: string): VerifyAppendReport {
  return JSON.parse(output) as VerifyAppendReport;
}

export function verifyFinishOptions(
  scenario: VerifyRunContextScenario,
  args: { readonly run: string; readonly terminalStatus: string },
): VerifyFinishCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    run: args.run,
    terminalStatus: args.terminalStatus,
  };
}

export function verifyStatusOptions(scenario: VerifyRunContextScenario, runToken: string): VerifyStatusCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    run: runToken,
  };
}

export function verifyRenderOptions(scenario: VerifyRunContextScenario, runToken: string): VerifyRenderCliOptions {
  return {
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scope: scenario.scope,
    run: runToken,
  };
}

export function parseFinishReport(output: string): VerifyFinishReport {
  return JSON.parse(output) as VerifyFinishReport;
}

export function parseStatusReport(output: string): VerifyStatusReport {
  return JSON.parse(output) as VerifyStatusReport;
}

export function parseRenderReport(output: string): VerifyRenderReport {
  return JSON.parse(output) as VerifyRenderReport;
}

/** Start a run over the shared store and return its run token, throwing when start fails. */
export async function startedRunToken(scenario: VerifyRunContextScenario, deps: VerifyCliDeps): Promise<string> {
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  return parseStartReport(started.output).runToken;
}

/** Append a generated batch of review findings to a run and return the batch, throwing on failure. */
export async function appendFindingBatch(
  scenario: VerifyRunContextScenario,
  deps: VerifyCliDeps,
  runToken: string,
): Promise<readonly FindingWithKey[]> {
  const findings = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFindingBatch());
  for (const entry of findings) {
    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(entry.finding),
        idempotencyKey: entry.idempotencyKey,
      }),
      deps,
    );
    if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
      throw new Error(`verify append-finding failed in harness: ${appended.output}`);
    }
  }
  return findings;
}

/** Finish a run with the given terminal status and return the parsed terminal projection, throwing on failure. */
export async function finishRun(
  scenario: VerifyRunContextScenario,
  deps: VerifyCliDeps,
  runToken: string,
  terminalStatus: string,
): Promise<VerifyFinishReport> {
  const finished = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
  if (finished.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify finish failed in harness: ${finished.output}`);
  }
  return parseFinishReport(finished.output);
}

/**
 * Prove a run is unsealed and finishable by finishing it with a freshly sampled terminal status: an
 * unsealed run records that status, so the returned report carries it back unchanged. A run already
 * finished returns its original terminal status through the idempotent `finish` projection, so the
 * status mismatch below is the proof the run was unsealed.
 */
export async function finishRecoversUnsealedRun(
  scenario: VerifyRunContextScenario,
  deps: VerifyCliDeps,
  runToken: string,
): Promise<VerifyFinishReport> {
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const report = await finishRun(scenario, deps, runToken, terminalStatus);
  if (report.terminalStatus !== terminalStatus) {
    throw new Error(
      `verify finish recorded terminal status ${String(report.terminalStatus)}, expected ${terminalStatus}`,
    );
  }
  return report;
}
