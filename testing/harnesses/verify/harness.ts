import { createHash } from "node:crypto";
import { basename, join } from "node:path";

import type { Command } from "commander";
import * as fc from "fast-check";

import { type JournalCliDeps, journalOpenCommand, journalReadCommand } from "@/commands/journal/cli";
import type { JournalStreamSink } from "@/commands/journal/runtime";
import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD,
  type VerifyAppendCliOptions,
  verifyAppendFindingCommand,
  type VerifyAppendReport,
  verifyAppendScopeCommand,
  type VerifyCliDeps,
  type VerifyFinishCliOptions,
  verifyFinishCommand,
  type VerifyFinishReport,
  type VerifyInputCliOptions,
  verifyInputCommand,
  type VerifyInputReport,
  type VerifyRenderCliOptions,
  verifyRenderCommand,
  type VerifyRenderReport,
  type VerifyStartCliOptions,
  verifyStartCommand,
  type VerifyStartReport,
  type VerifyStatusCliOptions,
  verifyStatusCommand,
  type VerifyStatusReport,
} from "@/commands/verify/cli";
import { DESCRIPTOR_DIGEST_HEX_ENCODING, DESCRIPTOR_DIGEST_SHA256_ALGORITHM } from "@/config/descriptor-digest";
import type { CliCommandResult } from "@/config/types";
import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import type { Domain } from "@/domains/types";
import {
  createVerificationContextDocument,
  VERIFICATION_CONTEXT_PERSISTENCE,
  VERIFICATION_CONTEXT_SCHEMA_VERSION,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
  type VerificationContextDocument,
  type VerificationContextDocumentResult,
} from "@/domains/verification-context/context";
import { verificationContextFilePath } from "@/domains/verification-context/path";
import {
  AUDIT_CLASS,
  AUDIT_COVERAGE_REQUIREMENT,
  AUDIT_COVERAGE_STATUS,
  AUDIT_FINDING_SEVERITY,
  AUDIT_KIND,
  type AuditFinding,
  auditPriorContextSelectorForScopeUnit,
  type AuditScopeUnit,
  filterAuditScopeUnitsForPriorContext,
  findTerminalEvent,
  REVIEW_SCOPE_COVERAGE_STATE,
  TERMINAL_METADATA_VALIDATION_ERROR,
  validateAuditFinding,
  validateAuditScope,
  VERIFY_APPEND_EVENT_FIELD,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_INPUT_RECORD,
  VERIFY_INPUT_SOURCE,
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_RUN_CONTEXT_EVENT_FIELD,
  VERIFY_RUN_CONTEXT_EVENT_TYPE,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
  VERIFY_VERIFICATION_TYPE,
  type VerifyAppendEventType,
  type VerifyDriveMode,
  verifyInputRecordPath,
  verifyRunsDir,
} from "@/domains/verify/verify";
import { SPX_COMMANDER_PARSE_SOURCE } from "@/interfaces/cli/product-context";
import { createCliProgram } from "@/interfaces/cli/program";
import { CLI_DOMAINS } from "@/interfaces/cli/registry";
import {
  registerVerifyCommands,
  VERIFICATION_RUN_CLI_SURFACE,
  VERIFY_CLI,
  type VerifyCliHandlers,
} from "@/interfaces/cli/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalSealMarkerPath,
} from "@/lib/appendable-journal-store";
import { GIT_NAME_STATUS_FLAG, pathsFromNameStatus } from "@/lib/git/name-status";
import {
  type ExecResult,
  GIT_COMMON_DIR_ARGS,
  GIT_CURRENT_BRANCH_ARGS,
  GIT_DIR_BASENAME,
  GIT_HEAD_SHA_ARGS,
  GIT_SHOW_TOPLEVEL_ARGS,
  type GitDependencies,
} from "@/lib/git/root";
import {
  ERROR_CODE_NOT_FOUND,
  resolveBranchIdentity,
  runFileName,
  slugBranchIdentity,
  STATE_STORE_PATH,
  STATE_STORE_SCOPE_PATH,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { arbitrarySourceFilePath, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  type FindingWithKey,
  formatNameStatusZ,
  sampleVerifyTestValue,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import { createInMemoryStateStoreFileSystem } from "@testing/harnesses/state/in-memory-file-system";
import { expect } from "vitest";

const GIT_UNEXPECTED_COMMAND: ExecResult = {
  exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
  stdout: "",
  stderr: "verify harness: unexpected git command",
};
const VERIFY_PROPERTY_REPLAY_SEED_ENV = "SPX_VERIFY_PROPERTY_SEED";
const VERIFY_PROPERTY_RUNS = 100;
const APPEND_COMMANDS = [verifyAppendScopeCommand, verifyAppendFindingCommand] as const;

interface RawJournalOpenReport {
  readonly runToken: string;
}

interface ExpectedTerminalProjection {
  readonly runToken: string;
  readonly terminalStatus: string;
  readonly sealed: true;
  readonly findingCount: number;
  readonly lastSequence: number;
}

interface VerifyCliRecording {
  readonly appendFindingOptions: readonly VerifyAppendCliOptions[];
  readonly appendScopeOptions: readonly VerifyAppendCliOptions[];
  readonly finishOptions: readonly VerifyFinishCliOptions[];
  readonly inputOptions: readonly VerifyInputCliOptions[];
  readonly renderOptions: readonly VerifyRenderCliOptions[];
  readonly startOptions: readonly VerifyStartCliOptions[];
  readonly statusOptions: readonly VerifyStatusCliOptions[];
  readonly handlers: VerifyCliHandlers;
}

export type VerifyStateStoreFileSystem = ReturnType<typeof createInMemoryStateStoreFileSystem>;

export interface SealRetryFileSystem extends StateStoreFileSystem {
  failDirectoryListings(): void;
  failFirstSealWriteAt(path: string): void;
  failSealMarkerReadsAt(path: string): void;
}

function commandTokens(command: Command): readonly string[] {
  return [command.name(), ...command.aliases()];
}

function collectCommandTokens(command: Command): readonly string[] {
  return [
    ...commandTokens(command),
    ...command.commands.flatMap((childCommand) => collectCommandTokens(childCommand)),
  ];
}

function requiredOptionFlags(command: Command | undefined): readonly string[] {
  return command?.options.filter((option) => option.required).map((option) => option.flags) ?? [];
}

function okCliResult(): CliCommandResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output: JSON.stringify({}) };
}

function createRecordingVerifyHandlers(): VerifyCliRecording {
  const appendFindingOptions: VerifyAppendCliOptions[] = [];
  const appendScopeOptions: VerifyAppendCliOptions[] = [];
  const finishOptions: VerifyFinishCliOptions[] = [];
  const inputOptions: VerifyInputCliOptions[] = [];
  const renderOptions: VerifyRenderCliOptions[] = [];
  const startOptions: VerifyStartCliOptions[] = [];
  const statusOptions: VerifyStatusCliOptions[] = [];

  return {
    appendFindingOptions,
    appendScopeOptions,
    finishOptions,
    inputOptions,
    renderOptions,
    startOptions,
    statusOptions,
    handlers: {
      appendFinding: (options) => {
        appendFindingOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      appendScope: (options) => {
        appendScopeOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      finish: (options) => {
        finishOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      input: (options) => {
        inputOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      render: (options) => {
        renderOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      start: (options) => {
        startOptions.push(options);
        return Promise.resolve(okCliResult());
      },
      status: (options) => {
        statusOptions.push(options);
        return Promise.resolve(okCliResult());
      },
    },
  };
}

function createRecordingVerifyProgram(recording: VerifyCliRecording, productDir: string): Command {
  const recordingDomain: Domain = {
    name: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    description: VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    register: (program, invocation) => {
      registerVerifyCommands(program, invocation, recording.handlers);
    },
  };
  return createCliProgram({
    domains: [recordingDomain],
    processCwd: () => productDir,
    setExitCode: () => undefined,
    writeStderr: () => undefined,
    writeStdout: () => undefined,
  });
}

function verificationRunArgs(commandPath: readonly string[], options: readonly string[]): readonly string[] {
  return [
    VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
    VERIFICATION_RUN_CLI_SURFACE.runCommandName,
    ...commandPath,
    ...options,
  ];
}

function requiredFlag(optionExpression: string): string {
  const [flag] = optionExpression.split(" ");
  return flag;
}

function requiredOptionDescription(command: Command | undefined, optionExpression: string): string | undefined {
  return command?.options.find((option) => option.flags === optionExpression)?.description;
}

export function assertVerificationRunNounGroupExposed(): void {
  const program = createCliProgram();
  const verificationCommand = program.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
  );

  expect(verificationCommand).toBeDefined();
  expect(verificationCommand?.commands.map((command) => command.name())).toContain(
    VERIFICATION_RUN_CLI_SURFACE.runCommandName,
  );
}

export function assertVerificationEvidenceAdditionsAreNounLocal(): void {
  const verifyDomain = CLI_DOMAINS.find((domain) => domain.name === VERIFICATION_RUN_CLI_SURFACE.rootCommandName);
  expect(verifyDomain).toBeDefined();
  if (verifyDomain === undefined) throw new Error("verification-run domain missing from the CLI registry");

  const program = createCliProgram({ domains: [verifyDomain] });
  const verificationCommand = program.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
  );
  const runCommand = verificationCommand?.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.runCommandName,
  );
  const scopeCommand = runCommand?.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName,
  );
  const findingCommand = runCommand?.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName,
  );
  expect(runCommand).toBeDefined();
  expect(scopeCommand).toBeDefined();
  expect(findingCommand).toBeDefined();

  const scopeAddCommand = scopeCommand?.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.addCommandName,
  );
  const findingAddCommand = findingCommand?.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.addCommandName,
  );
  expect(scopeAddCommand).toBeDefined();
  expect(findingAddCommand).toBeDefined();
  expect(requiredOptionFlags(scopeAddCommand)).toEqual(
    expect.arrayContaining([
      VERIFY_CLI.payloadOption,
      VERIFY_CLI.idempotencyKeyOption,
    ]),
  );
  expect(requiredOptionFlags(findingAddCommand)).toEqual(
    expect.arrayContaining([
      VERIFY_CLI.payloadOption,
      VERIFY_CLI.idempotencyKeyOption,
    ]),
  );
  expect(requiredOptionDescription(scopeAddCommand, VERIFY_CLI.payloadOption)).toBe(
    VERIFY_CLI.payloadOptionDescription,
  );
  expect(requiredOptionDescription(findingAddCommand, VERIFY_CLI.payloadOption)).toBe(
    VERIFY_CLI.payloadOptionDescription,
  );
  expect(requiredOptionDescription(scopeAddCommand, VERIFY_CLI.idempotencyKeyOption)).toBe(
    VERIFY_CLI.idempotencyKeyOptionDescription,
  );
  expect(requiredOptionDescription(findingAddCommand, VERIFY_CLI.idempotencyKeyOption)).toBe(
    VERIFY_CLI.idempotencyKeyOptionDescription,
  );
  for (const forbiddenHelpTerm of VERIFICATION_RUN_CLI_SURFACE.forbiddenRunHelpTerms) {
    expect(requiredOptionDescription(scopeAddCommand, VERIFY_CLI.payloadOption)).not.toContain(
      forbiddenHelpTerm,
    );
    expect(requiredOptionDescription(findingAddCommand, VERIFY_CLI.payloadOption)).not.toContain(
      forbiddenHelpTerm,
    );
  }
}

export function assertVerificationRunPathsHideJournalMechanics(): void {
  const program = createCliProgram();
  const commandNames = program.commands.flatMap((command) => commandTokens(command));
  const verificationCommand = program.commands.find(
    (command) => command.name() === VERIFICATION_RUN_CLI_SURFACE.rootCommandName,
  );
  // The whole `spx verification` family is swept, not the `run` subtree alone, so a
  // forbidden sibling — a `journal` or `event` command path added beside `run` — fails
  // this assertion rather than escaping it.
  const verificationCommandNames = verificationCommand === undefined
    ? []
    : collectCommandTokens(verificationCommand);

  expect(commandNames).not.toContain(VERIFICATION_RUN_CLI_SURFACE.forbiddenRootCommandName);
  for (const forbiddenRunCommandName of VERIFICATION_RUN_CLI_SURFACE.forbiddenRunCommandNames) {
    expect(verificationCommandNames).not.toContain(forbiddenRunCommandName);
  }
}

export async function assertVerificationRunOptionsReachHandlers(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const recording = createRecordingVerifyHandlers();
  const program = createRecordingVerifyProgram(recording, scenario.productDir);
  const inputSource = sampleLiteralTestValue(arbitrarySourceFilePath());
  const scopePayloadSource = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
  const findingPayloadSource = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const terminalMetadataSource = sampleLiteralTestValue(arbitrarySourceFilePath());
  const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
  const idempotencyKeys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  const sharedExistingRunOptions = [
    requiredFlag(VERIFY_CLI.verificationTypeOption),
    scenario.verificationType,
    requiredFlag(VERIFY_CLI.scopeTypeOption),
    VERIFY_SCOPE_TYPE.CHANGESET,
    requiredFlag(VERIFY_CLI.scopeOption),
    scenario.scope,
    requiredFlag(VERIFY_CLI.runOption),
    runToken,
  ];

  await program.parseAsync(
    verificationRunArgs([VERIFY_CLI.startCommandName], [
      requiredFlag(VERIFY_CLI.verificationTypeOption),
      scenario.verificationType,
      requiredFlag(VERIFY_CLI.scopeTypeOption),
      VERIFY_SCOPE_TYPE.CHANGESET,
      requiredFlag(VERIFY_CLI.scopeOption),
      scenario.scope,
      requiredFlag(VERIFY_CLI.inputOption),
      inputSource,
    ]),
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
  await program.parseAsync(
    verificationRunArgs(
      [VERIFICATION_RUN_CLI_SURFACE.scopeResourceCommandName, VERIFICATION_RUN_CLI_SURFACE.addCommandName],
      [
        ...sharedExistingRunOptions,
        requiredFlag(VERIFY_CLI.payloadOption),
        scopePayloadSource,
        requiredFlag(VERIFY_CLI.idempotencyKeyOption),
        idempotencyKeys.first,
      ],
    ),
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
  await program.parseAsync(
    verificationRunArgs(
      [VERIFICATION_RUN_CLI_SURFACE.findingResourceCommandName, VERIFICATION_RUN_CLI_SURFACE.addCommandName],
      [
        ...sharedExistingRunOptions,
        requiredFlag(VERIFY_CLI.payloadOption),
        findingPayloadSource,
        requiredFlag(VERIFY_CLI.idempotencyKeyOption),
        idempotencyKeys.second,
      ],
    ),
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
  await program.parseAsync(
    verificationRunArgs(
      [VERIFY_CLI.finishCommandName],
      [
        ...sharedExistingRunOptions,
        requiredFlag(VERIFY_CLI.terminalStatusOption),
        terminalStatus,
        requiredFlag(VERIFY_CLI.terminalMetadataOption),
        terminalMetadataSource,
      ],
    ),
    { from: SPX_COMMANDER_PARSE_SOURCE },
  );
  await program.parseAsync(verificationRunArgs([VERIFY_CLI.inputCommandName], sharedExistingRunOptions), {
    from: SPX_COMMANDER_PARSE_SOURCE,
  });
  await program.parseAsync(verificationRunArgs([VERIFY_CLI.statusCommandName], sharedExistingRunOptions), {
    from: SPX_COMMANDER_PARSE_SOURCE,
  });
  await program.parseAsync(verificationRunArgs([VERIFY_CLI.renderCommandName], sharedExistingRunOptions), {
    from: SPX_COMMANDER_PARSE_SOURCE,
  });

  expect(recording.startOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      input: inputSource,
    },
  ]);
  expect(recording.appendScopeOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      run: runToken,
      payload: scopePayloadSource,
      idempotencyKey: idempotencyKeys.first,
    },
  ]);
  expect(recording.appendFindingOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      run: runToken,
      payload: findingPayloadSource,
      idempotencyKey: idempotencyKeys.second,
    },
  ]);
  expect(recording.finishOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      run: runToken,
      terminalStatus,
      terminalMetadata: terminalMetadataSource,
    },
  ]);
  expect(recording.inputOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      run: runToken,
    },
  ]);
  expect(recording.statusOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      run: runToken,
    },
  ]);
  expect(recording.renderOptions).toEqual([
    {
      verificationType: scenario.verificationType,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      scope: scenario.scope,
      run: runToken,
    },
  ]);
}

export function createSealRetryFileSystem(): SealRetryFileSystem {
  const fs = createInMemoryStateStoreFileSystem();
  let blockedSealMarkerPath: string | undefined;
  let directoryListingsRejected = false;
  let rejectedSealMarkerReadPath: string | undefined;
  let sealFailuresRemaining = 0;
  return {
    appendFile: (path, data) => fs.appendFile(path, data),
    failDirectoryListings: () => {
      directoryListingsRejected = true;
    },
    failFirstSealWriteAt: (path: string) => {
      blockedSealMarkerPath = path;
      sealFailuresRemaining = 1;
    },
    failSealMarkerReadsAt: (path: string) => {
      rejectedSealMarkerReadPath = path;
    },
    lstat: (path) => fs.lstat(path),
    mkdir: (path, options) => fs.mkdir(path, options),
    readFile: (path, encoding) => {
      if (path === rejectedSealMarkerReadPath) {
        throw new Error("verify harness: seal marker read rejected");
      }
      return fs.readFile(path, encoding);
    },
    readdir: async (path, options) => {
      if (directoryListingsRejected) {
        throw new Error("verify harness: directory listing rejected");
      }
      return fs.readdir(path, options);
    },
    rename: (from, to) => fs.rename(from, to),
    rm: (path, options) => fs.rm(path, options),
    writeFile: async (path, data, options) => {
      if (path === blockedSealMarkerPath && sealFailuresRemaining > 0) {
        sealFailuresRemaining -= 1;
        throw new Error("verify harness: first seal write rejected");
      }
      await fs.writeFile(path, data, options);
    },
  };
}

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

function createReviewVerifyRunContextScenario(): VerifyRunContextScenario {
  return withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW);
}

interface StartedVerifyRun {
  readonly report: VerifyStartReport;
  readonly fs: VerifyStateStoreFileSystem;
}

async function startVerifyRun(scenario: VerifyRunContextScenario): Promise<StartedVerifyRun> {
  const fs = createInMemoryStateStoreFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  return { report: parseStartReport(started.output), fs };
}

export async function startReportFor(scenario: VerifyRunContextScenario): Promise<VerifyStartReport> {
  return (await startVerifyRun(scenario)).report;
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

/** Resolve the recorded-input file path for a started verify run, using the source-owned scope path helper. */
export function verifyInputRecordFilePath(scenario: VerifyRunContextScenario, runToken: string): string {
  const branchSlug = slugBranchIdentity(resolveBranchIdentity({
    branchName: scenario.branchIdentity,
    headSha: scenario.headSha,
  }));
  const inputPath = verifyInputRecordPath({
    productDir: scenario.productDir,
    branchSlug,
    type: scenario.verificationType,
    runToken,
  });
  if (!inputPath.ok) throw new Error(`verify harness: input record path failed: ${inputPath.error}`);
  return inputPath.value;
}

function expectedRunInputDigest(scenario: VerifyRunContextScenario): string {
  return createHash(DESCRIPTOR_DIGEST_SHA256_ALGORITHM)
    .update(JSON.stringify({ content: scenario.inputContent, source: VERIFY_INPUT_SOURCE.STDIN }))
    .digest(DESCRIPTOR_DIGEST_HEX_ENCODING);
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

export interface RecordingGitDeps {
  readonly git: GitDependencies;
  calls(): number;
}

interface ChangedScopeCwdRecordingGitDeps {
  readonly git: GitDependencies;
  changedScopeCwd(): string | undefined;
}

function createChangedScopeCwdRecordingGitDeps(scenario: VerifyRunContextScenario): ChangedScopeCwdRecordingGitDeps {
  let changedScopeCwd: string | undefined;
  return {
    git: {
      execa: async (command, args, options) => {
        if (args.includes(GIT_NAME_STATUS_FLAG)) changedScopeCwd = options?.cwd;
        return verifyGitDeps(scenario).execa(command, args, options);
      },
    },
    changedScopeCwd: () => changedScopeCwd,
  };
}

export function createRecordingGitDeps(): RecordingGitDeps {
  let count = 0;
  return {
    git: {
      execa: async () => {
        count += 1;
        return GIT_UNEXPECTED_COMMAND;
      },
    },
    calls: () => count,
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
    journalBinding: { localSink: createRecordingStreamSink().sink },
  };
}

/** Compose start deps that record the run's drive mode, so a test can open a caller-driven or spx-driven run. */
export function verifyDepsWithDriveMode(
  scenario: VerifyRunContextScenario,
  fs: VerifyStateStoreFileSystem,
  driveMode: VerifyDriveMode,
): VerifyCliDeps {
  return { ...verifyDeps(scenario, fs), driveMode };
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

function failChangedScopeGitDeps(base: GitDependencies): GitDependencies {
  return {
    execa: (command, args, options) => {
      if (args.includes(GIT_NAME_STATUS_FLAG)) {
        return Promise.resolve({
          exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
          stdout: "",
          stderr: VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED,
        });
      }
      return base.execa(command, args, options);
    },
  };
}

function createInputPersistFailureFileSystem(
  fs: StateStoreFileSystem = createInMemoryStateStoreFileSystem(),
): StateStoreFileSystem {
  return {
    appendFile: (path, data) => fs.appendFile(path, data),
    lstat: (path) => fs.lstat(path),
    mkdir: (path, options) => fs.mkdir(path, options),
    readFile: (path, encoding) => fs.readFile(path, encoding),
    readdir: (path, options) => fs.readdir(path, options),
    rename: async (from, to) => {
      const targetName = basename(to);
      if (targetName.startsWith(VERIFY_INPUT_RECORD.PREFIX) && targetName.endsWith(VERIFY_INPUT_RECORD.SUFFIX)) {
        throw new Error("verify harness: input record rename rejected");
      }
      await fs.rename(from, to);
    },
    rm: (path, options) => fs.rm(path, options),
    writeFile: (path, data, options) => fs.writeFile(path, data, options),
  };
}

function createJournalOpenFailureFileSystem(
  fs: StateStoreFileSystem = createInMemoryStateStoreFileSystem(),
): StateStoreFileSystem {
  return {
    appendFile: (path, data) => fs.appendFile(path, data),
    lstat: (path) => fs.lstat(path),
    mkdir: (path, options) => fs.mkdir(path, options),
    readFile: (path, encoding) => fs.readFile(path, encoding),
    readdir: (path, options) => fs.readdir(path, options),
    rename: (from, to) => fs.rename(from, to),
    rm: (path, options) => fs.rm(path, options),
    writeFile: async (path, data, options) => {
      const targetName = basename(path);
      if (
        targetName.startsWith(STATE_STORE_PATH.RUN_FILE_PREFIX) && targetName.endsWith(STATE_STORE_PATH.JSONL_EXTENSION)
      ) {
        throw new Error("verify harness: journal run file create rejected");
      }
      await fs.writeFile(path, data, options);
    },
  };
}

/** True for a run journal file — the JSONL the run-context event is appended to. */
function isRunJournalFile(path: string): boolean {
  const targetName = basename(path);
  return targetName.startsWith(STATE_STORE_PATH.RUN_FILE_PREFIX)
    && targetName.endsWith(STATE_STORE_PATH.JSONL_EXTENSION);
}

/**
 * A filesystem that rejects the run-context event write while allowing the empty run-file create,
 * so `start` fails at recording drive mode after opening the run. Open writes the run file empty;
 * the run-context event is the first non-empty write to that file, whether appended or written.
 */
function createRunContextAppendFailureFileSystem(
  fs: StateStoreFileSystem = createInMemoryStateStoreFileSystem(),
): StateStoreFileSystem {
  return {
    appendFile: async (path, data) => {
      if (isRunJournalFile(path)) throw new Error("verify harness: run-context event append rejected");
      await fs.appendFile(path, data);
    },
    lstat: (path) => fs.lstat(path),
    mkdir: (path, options) => fs.mkdir(path, options),
    readFile: (path, encoding) => fs.readFile(path, encoding),
    readdir: (path, options) => fs.readdir(path, options),
    rename: (from, to) => fs.rename(from, to),
    rm: (path, options) => fs.rm(path, options),
    writeFile: async (path, data, options) => {
      if (isRunJournalFile(path) && data.length > 0) {
        throw new Error("verify harness: run-context event write rejected");
      }
      await fs.writeFile(path, data, options);
    },
  };
}

function scenarioRunsDir(scenario: VerifyRunContextScenario): string {
  const branchSlug = slugBranchIdentity(resolveBranchIdentity({
    branchName: scenario.branchIdentity,
    headSha: scenario.headSha,
  }));
  const runs = verifyRunsDir({
    productDir: scenario.productDir,
    branchSlug,
    type: scenario.verificationType,
  });
  if (!runs.ok) throw new Error(`verify harness: runs directory failed: ${runs.error}`);
  return runs.value;
}

function scenarioContextDocument(scenario: VerifyRunContextScenario): VerificationContextDocumentResult {
  const branchSlug = slugBranchIdentity(resolveBranchIdentity({
    branchName: scenario.branchIdentity,
    headSha: scenario.headSha,
  }));
  const document = createVerificationContextDocument({
    schemaVersion: VERIFICATION_CONTEXT_SCHEMA_VERSION,
    subject: {
      kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
      base: scenario.base,
      head: scenario.head,
    },
    predicate: scenario.verificationType,
    workflow: { name: scenario.verificationType },
    launch: {
      productDir: scenario.productDir,
      branchSlug,
      branchIdentity: scenario.branchIdentity,
      headSha: scenario.headSha,
      createdAt: scenario.launchedAt.toISOString(),
    },
    persistence: VERIFICATION_CONTEXT_PERSISTENCE,
  });
  if (!document.ok) throw new Error(`verify harness: context document failed: ${document.error}`);
  return document.value;
}

function scenarioContextFilePath(scenario: VerifyRunContextScenario): string {
  const branchSlug = slugBranchIdentity(resolveBranchIdentity({
    branchName: scenario.branchIdentity,
    headSha: scenario.headSha,
  }));
  const document = scenarioContextDocument(scenario);
  const contextPath = verificationContextFilePath({
    productDir: scenario.productDir,
    branchSlug,
    digest: document.digest,
  });
  if (!contextPath.ok) throw new Error(`verify harness: context path failed: ${contextPath.error}`);
  return contextPath.value;
}

async function readScenarioContext(
  scenario: VerifyRunContextScenario,
  fs: VerifyStateStoreFileSystem,
): Promise<VerificationContextDocument> {
  return JSON.parse(
    await fs.readFile(scenarioContextFilePath(scenario), STATE_STORE_TEXT_ENCODING),
  ) as VerificationContextDocument;
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

export function parseRawJournalOpenReport(output: string): RawJournalOpenReport {
  return JSON.parse(output) as RawJournalOpenReport;
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
      throw new Error(`verify finding add failed in harness: ${appended.output}`);
    }
  }
  return findings;
}

function countEventsOfType(events: readonly JournalEvent[], eventType: VerifyAppendEventType): number {
  return events.filter((event) => event.type === eventType).length;
}

const VERIFY_APPEND_EVENT_TYPES: readonly string[] = Object.values(VERIFY_APPEND_EVENT_TYPE);

/** The evidence-append events (scope and finding) a run recorded, excluding the run-context and terminal events. */
function countAppendEvents(events: readonly JournalEvent[]): number {
  return events.filter((event) => VERIFY_APPEND_EVENT_TYPES.includes(event.type)).length;
}

function lastObservedSequence(events: readonly JournalEvent[]): number {
  return Math.max(...events.map((event) => event.seq));
}

async function expectedTerminalProjectionFromJournal(
  scenario: VerifyRunContextScenario,
  fs: VerifyStateStoreFileSystem,
  runToken: string,
  terminalStatus: string,
): Promise<ExpectedTerminalProjection> {
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  return {
    runToken,
    terminalStatus,
    sealed: true,
    findingCount: countEventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING),
    lastSequence: lastObservedSequence(events),
  };
}

export async function assertFinishReportMatchesJournal(
  report: VerifyFinishReport,
  scenario: VerifyRunContextScenario,
  fs: VerifyStateStoreFileSystem,
  runToken: string,
  terminalStatus: string,
): Promise<void> {
  const expected = await expectedTerminalProjectionFromJournal(scenario, fs, runToken, terminalStatus);
  if (report.runToken !== expected.runToken) {
    throw new Error(`finish projection run token ${report.runToken} did not match ${expected.runToken}`);
  }
  if (report.terminalStatus !== expected.terminalStatus) {
    throw new Error(
      `finish projection terminal status ${report.terminalStatus} did not match ${expected.terminalStatus}`,
    );
  }
  if (report.sealed !== expected.sealed) {
    throw new Error("finish projection did not report sealed journal state");
  }
  if (report.findingCount !== expected.findingCount) {
    throw new Error(
      `finish projection finding count ${report.findingCount.toString()} did not match ${expected.findingCount.toString()}`,
    );
  }
  if (report.lastSequence !== expected.lastSequence) {
    throw new Error(
      `finish projection last sequence ${report.lastSequence.toString()} did not match ${expected.lastSequence.toString()}`,
    );
  }
}

async function assertVerifyProperty<T>(
  arbitrary: fc.Arbitrary<T>,
  assertion: (value: T) => Promise<void>,
): Promise<void> {
  const replaySeed = verifyPropertyReplaySeed();
  const parameters = replaySeed === undefined
    ? { numRuns: VERIFY_PROPERTY_RUNS }
    : { numRuns: VERIFY_PROPERTY_RUNS, seed: replaySeed };
  await fc.assert(fc.asyncProperty(arbitrary, assertion), parameters);
}

function verifyPropertyReplaySeed(): number | undefined {
  const rawSeed = process.env[VERIFY_PROPERTY_REPLAY_SEED_ENV];
  if (rawSeed === undefined || rawSeed.length === 0) return undefined;
  const seed = Number(rawSeed);
  if (!Number.isInteger(seed)) {
    throw new Error(`${VERIFY_PROPERTY_REPLAY_SEED_ENV} must be an integer fast-check seed`);
  }
  return seed;
}

async function reviewAppendScenario(): Promise<{
  readonly scenario: VerifyRunContextScenario;
  readonly fs: VerifyStateStoreFileSystem;
  readonly deps: VerifyCliDeps;
  readonly runToken: string;
}> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const runToken = startReport.runToken;
  return { scenario, fs, deps, runToken };
}

async function auditAppendScenario(): Promise<{
  readonly scenario: VerifyRunContextScenario;
  readonly fs: VerifyStateStoreFileSystem;
  readonly deps: VerifyCliDeps;
  readonly runToken: string;
}> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.AUDIT),
  );
  const runToken = await startedRunToken(scenario, deps);
  return { scenario, fs, deps, runToken };
}

/** The run-context events a run's journal carries, each recording a drive mode. */
async function runContextEvents(
  scenario: VerifyRunContextScenario,
  fs: VerifyStateStoreFileSystem,
  runToken: string,
): Promise<readonly JournalEvent[]> {
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  return events.filter((event) => event.type === VERIFY_RUN_CONTEXT_EVENT_TYPE);
}

function recordedDriveMode(runContext: JournalEvent | undefined): unknown {
  const data = runContext?.data;
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)[VERIFY_RUN_CONTEXT_EVENT_FIELD.DRIVE_MODE]
    : undefined;
}

/** Start a run under the given drive mode and return its run token, scenario, and store. */
async function startRunWithDriveMode(driveMode: VerifyDriveMode): Promise<{
  readonly scenario: VerifyRunContextScenario;
  readonly fs: VerifyStateStoreFileSystem;
  readonly deps: VerifyCliDeps;
  readonly runToken: string;
}> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDepsWithDriveMode(scenario, fs, driveMode);
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  return { scenario, fs, deps, runToken: parseStartReport(started.output).runToken };
}

/** Asserts a caller-path start records exactly one run-context event carrying caller-driven drive mode. */
export async function assertStartRecordsCallerDriveModeByDefault(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const runContexts = await runContextEvents(scenario, fs, parseStartReport(started.output).runToken);
  expect(runContexts).toHaveLength(1);
  expect(recordedDriveMode(runContexts[0])).toBe(VERIFY_DRIVE_MODE.CALLER);
}

/** Asserts an spx-driven start records the run-context event carrying spx-driven drive mode. */
export async function assertStartRecordsSpxDriveModeWhenSpxDriven(): Promise<void> {
  const { scenario, fs, runToken } = await startRunWithDriveMode(VERIFY_DRIVE_MODE.SPX);
  const runContexts = await runContextEvents(scenario, fs, runToken);
  expect(runContexts).toHaveLength(1);
  expect(recordedDriveMode(runContexts[0])).toBe(VERIFY_DRIVE_MODE.SPX);
}

/** Asserts a caller-driven run's status and render advertise the caller evidence-append actions. */
export async function assertCallerDrivenRunAdvertisesEvidenceAppendActions(): Promise<void> {
  const { scenario, deps, runToken } = await startRunWithDriveMode(VERIFY_DRIVE_MODE.CALLER);
  const status = parseStatusReport((await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output);
  const render = parseRenderReport((await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output);
  for (const projected of [status, render] as const) {
    expect(projected.driveMode).toBe(VERIFY_DRIVE_MODE.CALLER);
    expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
    expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
    expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINISH);
  }
}

/** Asserts an unsealed spx-driven run's status and render advertise no caller evidence-append action. */
export async function assertSpxDrivenRunAdvertisesNoEvidenceAppendAction(): Promise<void> {
  const { scenario, deps, runToken } = await startRunWithDriveMode(VERIFY_DRIVE_MODE.SPX);
  const status = parseStatusReport((await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output);
  const render = parseRenderReport((await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output);
  for (const projected of [status, render] as const) {
    expect(projected.driveMode).toBe(VERIFY_DRIVE_MODE.SPX);
    expect(projected.sealed).toBe(false);
    expect(projected.nextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
    expect(projected.nextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
    expect(projected.nextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINISH);
  }
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function assertEqualJson(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message);
  }
}

export async function assertInvalidReviewScopeRejectedBeforeAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await reviewAppendScenario();
  const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const eventsBeforeInvalidScope = await readVerifyRunEvents(scenario, runToken, fs);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.invalidReviewScopeUnit(), async (invalidScope) => {
    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(invalidScope),
        idempotencyKey: key,
      }),
      deps,
    );
    if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || appended.output !== VERIFY_CLI_ERROR.SCOPE_INVALID) {
      throw new Error(`expected invalid review scope rejection, received ${appended.output}`);
    }
  });

  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeInvalidScope,
    "invalid review scope append mutated journal events",
  );
}

export async function assertValidReviewScopeRecordsScopeEvidenceKind(): Promise<void> {
  const { scenario, fs, deps, runToken } = await reviewAppendScenario();
  const scope = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit());
  const appended = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(scope),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`valid review scope append failed: ${appended.output}`);
  }
  if (parseAppendReport(appended.output).sequence < JOURNAL_SEQ_BASE) {
    throw new Error("valid review scope append returned an invalid journal sequence");
  }
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  const scopeEvents = events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE);
  const findingEvents = events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING);
  if (scopeEvents.length !== 1) {
    throw new Error(`expected one review scope event, received ${scopeEvents.length.toString()}`);
  }
  if (findingEvents.length !== 0) {
    throw new Error(`expected zero review finding events, received ${findingEvents.length.toString()}`);
  }
  if (!JSON.stringify(scopeEvents[0]?.data).includes(scope.path)) {
    throw new Error("review scope event did not record the scope unit path");
  }
}

export async function assertAppendRecordsValidatedEvidencePayload(): Promise<void> {
  const { scenario, fs, deps, runToken } = await reviewAppendScenario();
  const scope = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit());
  const payload = {
    ...scope,
    extraProviderField: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
  };
  const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const appended = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(payload),
      idempotencyKey,
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  const scopeEvents = events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE);
  expect(scopeEvents).toHaveLength(1);
  expect(scopeEvents[0]?.data).toEqual({
    [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: idempotencyKey,
    [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: scope,
  });
}

export async function assertReviewScopeProjectionIncludesCleanReviewedUnit(): Promise<void> {
  const { scenario, deps, runToken } = await reviewAppendScenario();
  const scope = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
    coverageState: REVIEW_SCOPE_COVERAGE_STATE.CLEAN,
  };
  const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const appended = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(scope),
      idempotencyKey,
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseRenderReport(
    (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
  );
  const scopeEvents = report.events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE);
  const findingEvents = report.events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING);
  expect(report.findingCount).toBe(0);
  expect(scopeEvents).toHaveLength(1);
  expect(findingEvents).toHaveLength(0);
  expect(scopeEvents[0]?.data).toEqual({
    [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: idempotencyKey,
    [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: scope,
  });
}

export async function assertAuditScopePayloadsConformToSchema(): Promise<void> {
  await assertVerifyProperty(VERIFY_TEST_GENERATOR.auditScopeUnit(), async (scopeUnit) => {
    const payload = toJsonValue(scopeUnit);
    expect(validateAuditScope(payload)).toEqual(scopeUnit);
  });
  await assertVerifyProperty(VERIFY_TEST_GENERATOR.auditScopeUnit(), async (scopeUnit) => {
    const { producerProvenance: _producerProvenance, ...scopeUnitWithoutProvenance } = scopeUnit;
    const payload = toJsonValue(scopeUnitWithoutProvenance);
    expect(validateAuditScope(payload)).toEqual(scopeUnitWithoutProvenance);
  });
  await assertVerifyProperty(VERIFY_TEST_GENERATOR.auditScopeUnitWithoutOptionalFields(), async (scopeUnit) => {
    const payload = toJsonValue(scopeUnit);
    expect(validateAuditScope(payload)).toEqual(scopeUnit);
  });
}

export async function assertAuditFindingPayloadsConformToSchema(): Promise<void> {
  await assertVerifyProperty(VERIFY_TEST_GENERATOR.auditFinding(), async (finding) => {
    const payload = toJsonValue(finding);
    expect(validateAuditFinding(payload)).toEqual(finding);
  });
}

export async function assertInvalidAuditScopeRejectedBeforeAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await auditAppendScenario();
  const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const eventsBeforeInvalidScope = await readVerifyRunEvents(scenario, runToken, fs);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.invalidAuditScopeUnit(), async (invalidScope) => {
    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(invalidScope),
        idempotencyKey: key,
      }),
      deps,
    );
    if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || appended.output !== VERIFY_CLI_ERROR.SCOPE_INVALID) {
      throw new Error(`expected invalid audit scope rejection, received ${appended.output}`);
    }
  });

  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeInvalidScope,
    "invalid audit scope append mutated journal events",
  );
}

export async function assertInvalidAuditFindingRejectedBeforeAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await auditAppendScenario();
  const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const eventsBeforeInvalidFinding = await readVerifyRunEvents(scenario, runToken, fs);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.invalidAuditFinding(), async (invalidFinding) => {
    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(invalidFinding),
        idempotencyKey: key,
      }),
      deps,
    );
    if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || appended.output !== VERIFY_CLI_ERROR.FINDING_INVALID) {
      throw new Error(`expected invalid audit finding rejection, received ${appended.output}`);
    }
  });

  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeInvalidFinding,
    "invalid audit finding append mutated journal events",
  );
}

export async function assertAuditFindingUnknownUnitRejectedBeforeAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await auditAppendScenario();
  const scope = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit());
  const finding = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditFinding()),
    unitId: selectAlternateString(scope.unitId, [
      sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken()),
    ]),
  };
  await appendAuditScope(scenario, deps, runToken, scope);
  const eventsBeforeInvalidFinding = await readVerifyRunEvents(scenario, runToken, fs);
  const appended = await verifyAppendFindingCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(finding),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(appended.output).toBe(VERIFY_CLI_ERROR.FINDING_INVALID);
  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeInvalidFinding,
    "unknown-unit audit finding append mutated journal events",
  );
}

export async function assertAuditFindingEmptyEvidenceRejectedBeforeAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await auditAppendScenario();
  const scope = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit());
  const finding = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditFinding()),
    unitId: scope.unitId,
    evidence: {},
  };
  await appendAuditScope(scenario, deps, runToken, scope);
  const eventsBeforeInvalidFinding = await readVerifyRunEvents(scenario, runToken, fs);
  const appended = await verifyAppendFindingCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(finding),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(appended.output).toBe(VERIFY_CLI_ERROR.FINDING_INVALID);
  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeInvalidFinding,
    "empty-evidence audit finding append mutated journal events",
  );
}

async function appendAuditScope(
  scenario: VerifyRunContextScenario,
  deps: VerifyCliDeps,
  runToken: string,
  scope: AuditScopeUnit,
  idempotencyKey: string = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
): Promise<void> {
  const appended = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(scope),
      idempotencyKey,
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
}

async function appendAuditFinding(
  scenario: VerifyRunContextScenario,
  deps: VerifyCliDeps,
  runToken: string,
  finding: AuditFinding,
): Promise<void> {
  const appended = await verifyAppendFindingCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(finding),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
}

export async function assertAuditScopeProjectionPreservesUnits(): Promise<void> {
  const { scenario, deps, runToken } = await auditAppendScenario();
  const scopeIds = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  const idempotencyKeys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  const parent = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    unitId: scopeIds.first,
    parentUnitId: undefined,
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
  };
  const child = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    unitId: scopeIds.second,
    parentUnitId: parent.unitId,
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
  };
  await appendAuditScope(scenario, deps, runToken, parent, idempotencyKeys.first);
  await appendAuditScope(scenario, deps, runToken, child, idempotencyKeys.second);
  const report = parseRenderReport(
    (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
  );
  const scopeEvents = report.events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE);
  expect(scopeEvents.map((event) => (event.data as { readonly payload: JsonValue }).payload)).toEqual([
    toJsonValue(parent),
    toJsonValue(child),
  ]);
  expect(report.findingCount).toBe(0);
}

export async function assertAuditPriorContextSelectorsFilterScopeUnits(): Promise<void> {
  const baseCurrent = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    auditClass: AUDIT_CLASS.IMPLEMENTATION,
    auditKind: AUDIT_KIND.ARCHITECTURE,
  };
  const alternate = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit());
  const alternatePaths = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.changedPathsPair());
  const alternatePartitions = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  const alternateSubject = selectAlternateString(baseCurrent.subject, [
    ...alternatePaths.first,
    ...alternatePaths.second,
    alternate.subject,
  ]);
  const alternateChangedFilePartition = selectAlternateString(
    baseCurrent.priorContext.changedFilePartition,
    [alternatePartitions.first, alternatePartitions.second],
  );
  const currentLanguagePartition = baseCurrent.priorContext.languagePartition;
  expect(currentLanguagePartition).toBeDefined();
  const alternateLanguagePartition = selectAlternateString(
    currentLanguagePartition ?? baseCurrent.priorContext.changedFilePartition,
    [alternatePartitions.first, alternatePartitions.second],
  );
  const alternateConcernPartition = selectAlternateString(
    baseCurrent.priorContext.concernPartition,
    [alternatePartitions.first, alternatePartitions.second, alternate.priorContext.concernPartition],
  );
  const alternateExpectedProducer = {
    ...baseCurrent.expectedProducer,
    invocationRole: selectAlternateString(
      baseCurrent.expectedProducer.invocationRole,
      [alternatePartitions.first, alternatePartitions.second, alternate.expectedProducer.invocationRole],
    ),
  };
  const recordedByRunDriver = {
    ...baseCurrent.expectedProducer,
    invocationRole: selectAlternateString(
      baseCurrent.expectedProducer.invocationRole,
      [alternatePartitions.first, alternatePartitions.second, alternate.recordedByRunDriver.invocationRole],
    ),
  };
  const alternateRecordedByRunDriver = {
    ...recordedByRunDriver,
    invocationRole: selectAlternateString(
      recordedByRunDriver.invocationRole,
      [baseCurrent.expectedProducer.invocationRole, alternate.expectedProducer.invocationRole],
    ),
  };
  const current = { ...baseCurrent, recordedByRunDriver };
  const { producerProvenance: _currentProducerProvenance, ...currentWithoutProducerProvenance } = current;
  const selector = auditPriorContextSelectorForScopeUnit(current);

  expect(selector).toEqual({
    auditClass: current.auditClass,
    auditKind: current.auditKind,
    expectedProducer: current.expectedProducer,
    subjectPath: current.subject,
    changedFilePartition: current.priorContext.changedFilePartition,
    concernPartition: current.priorContext.concernPartition,
    languagePartition: current.priorContext.languagePartition,
    producerIdentity: current.recordedByRunDriver,
  });
  expect(filterAuditScopeUnitsForPriorContext([
    { ...current, auditClass: AUDIT_CLASS.SPEC },
    { ...current, auditKind: AUDIT_KIND.CODE },
    { ...current, expectedProducer: alternateExpectedProducer },
    { ...current, recordedByRunDriver: alternateRecordedByRunDriver },
    { ...current, subject: alternateSubject },
    {
      ...current,
      priorContext: {
        ...current.priorContext,
        changedFilePartition: alternateChangedFilePartition,
      },
    },
    {
      ...current,
      priorContext: {
        ...current.priorContext,
        languagePartition: alternateLanguagePartition,
      },
    },
    {
      ...current,
      priorContext: {
        ...current.priorContext,
        concernPartition: alternateConcernPartition,
      },
    },
    currentWithoutProducerProvenance,
    current,
  ], selector)).toEqual([currentWithoutProducerProvenance, current]);

  const planned = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnitWithoutOptionalFields());
  const plannedSelector = auditPriorContextSelectorForScopeUnit(planned);

  expect(plannedSelector.producerIdentity).toEqual(planned.recordedByRunDriver);
  expect(filterAuditScopeUnitsForPriorContext([planned], plannedSelector)).toEqual([planned]);
}

function selectAlternateString(current: string, candidates: readonly string[]): string {
  const alternate = candidates.find((candidate) => candidate !== current);
  expect(alternate).toBeDefined();
  return alternate ?? current;
}

export async function assertAuditCleanCoverageDoesNotInventFinding(): Promise<void> {
  const { scenario, deps, runToken } = await auditAppendScenario();
  const scope = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
  };
  await appendAuditScope(scenario, deps, runToken, scope);
  const report = parseRenderReport(
    (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
  );
  expect(report.findingCount).toBe(0);
  expect(report.events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
  expect(report.events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
}

export async function assertAuditTerminalRollupMapsCoverageAndFindings(): Promise<void> {
  const requiredClean = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
  };
  const requiredNotApplicable = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.NOT_APPLICABLE,
  };
  const optionalUncovered = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.OPTIONAL,
    coverageStatus: AUDIT_COVERAGE_STATUS.INCOMPLETE,
  };
  const { producerProvenance: _requiredCoverageGapProvenance, ...requiredCoverageGapBase } = sampleVerifyTestValue(
    VERIFY_TEST_GENERATOR.auditScopeUnit(),
  );
  const requiredCoverageGap = {
    ...requiredCoverageGapBase,
    auditKind: AUDIT_KIND.COVERAGE_GAP,
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.MISSING_SKILL,
  };

  const cleanScenario = await auditAppendScenario();
  const cleanScopeKeys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  await appendAuditScope(
    cleanScenario.scenario,
    cleanScenario.deps,
    cleanScenario.runToken,
    requiredClean,
    cleanScopeKeys.first,
  );
  await appendAuditScope(
    cleanScenario.scenario,
    cleanScenario.deps,
    cleanScenario.runToken,
    optionalUncovered,
    cleanScopeKeys.second,
  );
  await appendAuditScope(
    cleanScenario.scenario,
    cleanScenario.deps,
    cleanScenario.runToken,
    requiredNotApplicable,
  );
  expect(
    await finishRun(
      cleanScenario.scenario,
      cleanScenario.deps,
      cleanScenario.runToken,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
    ),
  ).toMatchObject({ terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED });

  const emptyScenario = await auditAppendScenario();
  const emptyRejected = await verifyFinishCommand(
    verifyFinishOptions(emptyScenario.scenario, {
      run: emptyScenario.runToken,
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
    }),
    emptyScenario.deps,
  );
  expect(emptyRejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(emptyRejected.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
  expect(
    await finishRun(
      emptyScenario.scenario,
      emptyScenario.deps,
      emptyScenario.runToken,
      JOURNAL_RUN_STATE_STATUS.REJECTED,
    ),
  ).toMatchObject({ terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED });

  for (const coverageStatus of requiredRejectingAuditCoverageStatuses()) {
    const uncoveredScenario = await auditAppendScenario();
    await appendAuditScope(
      uncoveredScenario.scenario,
      uncoveredScenario.deps,
      uncoveredScenario.runToken,
      {
        ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
        coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
        coverageStatus,
      },
    );
    const uncoveredRejected = await verifyFinishCommand(
      verifyFinishOptions(uncoveredScenario.scenario, {
        run: uncoveredScenario.runToken,
        terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      }),
      uncoveredScenario.deps,
    );
    expect(uncoveredRejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(uncoveredRejected.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
    expect(
      await finishRun(
        uncoveredScenario.scenario,
        uncoveredScenario.deps,
        uncoveredScenario.runToken,
        JOURNAL_RUN_STATE_STATUS.REJECTED,
      ),
    ).toMatchObject({ terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED });
  }

  const gapScenario = await auditAppendScenario();
  await appendAuditScope(
    gapScenario.scenario,
    gapScenario.deps,
    gapScenario.runToken,
    requiredCoverageGap,
  );
  const gapRejected = await verifyFinishCommand(
    verifyFinishOptions(gapScenario.scenario, {
      run: gapScenario.runToken,
      terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
    }),
    gapScenario.deps,
  );
  expect(gapRejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(gapRejected.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
  expect(
    await finishRun(
      gapScenario.scenario,
      gapScenario.deps,
      gapScenario.runToken,
      JOURNAL_RUN_STATE_STATUS.REJECTED,
    ),
  ).toMatchObject({ terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED });

  for (const severity of Object.values(AUDIT_FINDING_SEVERITY)) {
    const findingScenario = await auditAppendScenario();
    await appendAuditScope(findingScenario.scenario, findingScenario.deps, findingScenario.runToken, requiredClean);
    await appendAuditFinding(
      findingScenario.scenario,
      findingScenario.deps,
      findingScenario.runToken,
      {
        ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditFinding()),
        unitId: requiredClean.unitId,
        severity,
      },
    );
    const findingRejected = await verifyFinishCommand(
      verifyFinishOptions(findingScenario.scenario, {
        run: findingScenario.runToken,
        terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      }),
      findingScenario.deps,
    );
    expect(findingRejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(findingRejected.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
    expect(
      await finishRun(
        findingScenario.scenario,
        findingScenario.deps,
        findingScenario.runToken,
        JOURNAL_RUN_STATE_STATUS.REJECTED,
      ),
    ).toMatchObject({ terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED });
  }
}

export async function assertAuditRejectsSuppliedTerminalMetadata(): Promise<void> {
  const { scenario, fs, deps, runToken } = await auditAppendScenario();
  const scope = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
    coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
    coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
  };
  await appendAuditScope(scenario, deps, runToken, scope);
  const eventsBeforeInvalidMetadata = await readVerifyRunEvents(scenario, runToken, fs);
  const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
  const finished = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
      terminalMetadata: JSON.stringify(terminalMetadata),
    },
    deps,
  );
  expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_METADATA_INVALID);
  expect(await readVerifyRunEvents(scenario, runToken, fs)).toEqual(eventsBeforeInvalidMetadata);
  expect(
    await finishRun(
      scenario,
      deps,
      runToken,
      JOURNAL_RUN_STATE_STATUS.APPROVED,
    ),
  ).toMatchObject({ terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED });
}

function requiredRejectingAuditCoverageStatuses(): readonly AuditScopeUnit["coverageStatus"][] {
  return Object.values(AUDIT_COVERAGE_STATUS).filter((status) =>
    status !== AUDIT_COVERAGE_STATUS.AUDITED && status !== AUDIT_COVERAGE_STATUS.NOT_APPLICABLE
  );
}

export async function assertInvalidReviewFindingRejectedBeforeAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await reviewAppendScenario();
  const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const eventsBeforeInvalidFindings = await readVerifyRunEvents(scenario, runToken, fs);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.invalidReviewFinding(), async (invalidFinding) => {
    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(invalidFinding),
        idempotencyKey: key,
      }),
      deps,
    );
    if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || appended.output !== VERIFY_CLI_ERROR.FINDING_INVALID) {
      throw new Error(`expected invalid review finding rejection, received ${appended.output}`);
    }
  });

  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeInvalidFindings,
    "invalid review finding append mutated journal events",
  );
}

export async function assertValidReviewFindingRecordsBoundaryEvidence(): Promise<void> {
  const { scenario, fs, deps, runToken } = await reviewAppendScenario();
  const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
  const appended = await verifyAppendFindingCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(finding),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`valid review finding append failed: ${appended.output}`);
  }
  if (parseAppendReport(appended.output).sequence < JOURNAL_SEQ_BASE) {
    throw new Error("valid review finding append returned an invalid journal sequence");
  }
  const findingEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
    (event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING,
  );
  if (findingEvents.length !== 1) {
    throw new Error(`expected one review finding event, received ${findingEvents.length.toString()}`);
  }
  if (!JSON.stringify(findingEvents[0]?.data).includes(finding.finding.summary)) {
    throw new Error("review finding event did not record the finding summary");
  }
}

export async function assertReviewCommentProjectionIncludesFindingPayload(): Promise<void> {
  const { scenario, deps, runToken } = await reviewAppendScenario();
  const findings = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFindingAnchorVariants());
  const idempotencyKeys = sampleVerifyTestValue(
    fc.uniqueArray(VERIFY_TEST_GENERATOR.idempotencyKey(), { minLength: findings.length, maxLength: findings.length }),
  );
  for (const [index, finding] of findings.entries()) {
    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(finding),
        idempotencyKey: idempotencyKeys[index],
      }),
      deps,
    );
    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  }
  const report = parseRenderReport(
    (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
  );
  const findingEvents = report.events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING);
  expect(report.findingCount).toBe(findings.length);
  expect(findingEvents).toHaveLength(findings.length);
  expect(findingEvents.map((event) => event.data)).toEqual(
    findings.map((finding, index) => ({
      [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: idempotencyKeys[index],
      [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: finding,
    })),
  );
}

export async function assertReviewFindingSelectorMismatchRejectsWithoutAppend(): Promise<void> {
  const { scenario, fs, deps, runToken } = await reviewAppendScenario();
  const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
  const eventsBeforeRejectedAppend = await readVerifyRunEvents(scenario, runToken, fs);
  const appended = await verifyAppendFindingCommand(
    {
      ...verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(finding),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      scope: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`,
    },
    deps,
  );
  if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR) {
    throw new Error("selector-mismatch finding append unexpectedly succeeded");
  }
  if (!appended.output.includes(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH)) {
    throw new Error(`selector-mismatch append returned wrong diagnostic: ${appended.output}`);
  }
  if (!appended.output.includes(verifyInputRecordFilePath(scenario, runToken))) {
    throw new Error("selector-mismatch append diagnostic did not identify the recorded input path");
  }
  assertEqualJson(
    await readVerifyRunEvents(scenario, runToken, fs),
    eventsBeforeRejectedAppend,
    "selector-mismatch review finding append mutated journal events",
  );
}

export async function assertReviewTerminalMetadataConflictRejectsWithoutSealing(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  const startReport = parseStartReport(started.output);
  const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata());
  const finished = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, {
        run: startReport.runToken,
        terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED,
      }),
      terminalMetadata: JSON.stringify(terminalMetadata),
    },
    deps,
  );
  if (
    finished.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR
    || !finished.output.includes(TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT)
  ) {
    throw new Error(`expected terminal metadata conflict rejection, received ${finished.output}`);
  }
  if (findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs)) !== undefined) {
    throw new Error("terminal metadata conflict recorded terminal completion");
  }
  await fs.readFile(appendableJournalSealMarkerPath(startReport.locator.runTarget), STATE_STORE_TEXT_ENCODING).then(
    () => {
      throw new Error("terminal metadata conflict sealed the journal");
    },
    () => undefined,
  );
  await finishRecoversUnsealedRun(scenario, deps, startReport.runToken);
}

export async function assertReviewFindingsRejectApprovedTerminalStatus(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const runToken = startReport.runToken;
  await appendFindingBatch(scenario, deps, runToken);
  const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
  const finished = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
      terminalMetadata: JSON.stringify(terminalMetadata),
    },
    deps,
  );
  expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
  expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
  await expect(
    fs.readFile(appendableJournalSealMarkerPath(startReport.locator.runTarget), STATE_STORE_TEXT_ENCODING),
  ).rejects.toThrow();
  await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
}

export async function assertReviewFindingScopeRejectsApprovedTerminalStatus(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const runToken = startReport.runToken;
  const scope = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
    coverageState: REVIEW_SCOPE_COVERAGE_STATE.FINDING,
  };
  const appended = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(scope),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const eventsAfterScope = await readVerifyRunEvents(scenario, runToken, fs);
  expect(eventsAfterScope.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
  const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
  const finished = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
      terminalMetadata: JSON.stringify(terminalMetadata),
    },
    deps,
  );
  expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
  expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
  await expect(
    fs.readFile(appendableJournalSealMarkerPath(startReport.locator.runTarget), STATE_STORE_TEXT_ENCODING),
  ).rejects.toThrow();
  await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
}

export async function assertReviewCommentedTerminalMetadataAcceptsCallerTerminalStatus(): Promise<void> {
  for (const terminalStatus of [JOURNAL_RUN_STATE_STATUS.APPROVED, JOURNAL_RUN_STATE_STATUS.REJECTED]) {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewCommentedTerminalMetadata());
    const finished = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
        terminalMetadata: JSON.stringify(terminalMetadata),
      },
      deps,
    );
    const report = parseFinishReport(finished.output);
    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(report.terminalStatus).toBe(terminalStatus);
    expect(report.terminalMetadata).toEqual(terminalMetadata);
  }
}

export async function assertReviewTerminalMetadataStateMapsTerminalStatus(): Promise<void> {
  {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
    const finished = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
        terminalMetadata: JSON.stringify(terminalMetadata),
      },
      deps,
    );
    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(finished.output).terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.APPROVED);
  }
  {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata());
    const finished = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED }),
        terminalMetadata: JSON.stringify(terminalMetadata),
      },
      deps,
    );
    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
  }
  {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata());
    const finished = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED }),
        terminalMetadata: JSON.stringify(terminalMetadata),
      },
      deps,
    );
    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(finished.output).terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.REJECTED);
  }
  {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const terminalMetadata = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewChangesRequestedTerminalMetadata());
    const finished = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
        terminalMetadata: JSON.stringify(terminalMetadata),
      },
      deps,
    );
    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT);
  }
  await assertReviewCommentedTerminalMetadataAcceptsCallerTerminalStatus();
}

export async function assertBlankTerminalStatusRejectedWithoutCompletion(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  const startReport = parseStartReport(started.output);
  const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.blankTerminalStatus(), async (blankStatus) => {
    const finished = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus: blankStatus }),
      deps,
    );
    if (
      finished.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || finished.output !== VERIFY_CLI_ERROR.TERMINAL_STATUS_REQUIRED
    ) {
      throw new Error(`expected blank terminal status rejection, received ${finished.output}`);
    }
  });

  if (findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs)) !== undefined) {
    throw new Error("blank terminal status recorded terminal completion");
  }
  await fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING).then(
    () => {
      throw new Error("blank terminal status sealed the journal");
    },
    () => undefined,
  );
  await finishRecoversUnsealedRun(scenario, deps, startReport.runToken);
}

export async function assertInvalidTerminalStatusRejectedWithoutCompletion(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  const startReport = parseStartReport(started.output);
  const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.invalidTerminalStatus(), async (invalidStatus) => {
    const finished = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus: invalidStatus }),
      deps,
    );
    if (
      finished.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || finished.output !== VERIFY_CLI_ERROR.TERMINAL_STATUS_INVALID
    ) {
      throw new Error(`expected invalid terminal status rejection, received ${finished.output}`);
    }
  });

  if (findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs)) !== undefined) {
    throw new Error("invalid terminal status recorded terminal completion");
  }
  await fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING).then(
    () => {
      throw new Error("invalid terminal status sealed the journal");
    },
    () => undefined,
  );
  await finishRecoversUnsealedRun(scenario, deps, startReport.runToken);
}

export async function assertInvalidReviewTerminalMetadataRejectedWithoutCompletion(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  if (started.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify start failed in harness: ${started.output}`);
  }
  const startReport = parseStartReport(started.output);
  const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.invalidReviewTerminalMetadata(), async (terminalMetadata) => {
    const finished = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
        terminalMetadata: JSON.stringify(terminalMetadata),
      },
      deps,
    );
    if (
      finished.exitCode !== VERIFY_CLI_EXIT_CODE.ERROR || finished.output !== VERIFY_CLI_ERROR.TERMINAL_METADATA_INVALID
    ) {
      throw new Error(`expected invalid terminal metadata rejection, received ${finished.output}`);
    }
  });

  if (findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs)) !== undefined) {
    throw new Error("invalid terminal metadata recorded terminal completion");
  }
  await fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING).then(
    () => {
      throw new Error("invalid terminal metadata sealed the journal");
    },
    () => undefined,
  );
  await finishRecoversUnsealedRun(scenario, deps, startReport.runToken);
}

export async function openRawJournalRun(
  scenario: VerifyRunContextScenario,
  deps: VerifyCliDeps,
): Promise<RawJournalOpenReport> {
  const opened = await journalOpenCommand({ type: scenario.verificationType }, deps);
  if (opened.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`raw journal open failed in harness: ${opened.output}`);
  }
  return parseRawJournalOpenReport(opened.output);
}

export function singleTerminalEvent(events: readonly JournalEvent[]): JournalEvent {
  const terminalEvents = events.filter((event) => event.type === VERIFY_TERMINAL_EVENT_TYPE);
  if (terminalEvents.length !== 1) {
    throw new Error(`expected one terminal event, received ${terminalEvents.length.toString()}`);
  }
  const [event] = terminalEvents;
  return event;
}

export async function assertAppendPayloadRequiredForEveryAppendVerb(): Promise<void> {
  const scenario = createVerifyRunContextScenario();

  for (const command of APPEND_COMMANDS) {
    await assertVerifyProperty(
      fc.tuple(
        VERIFY_TEST_GENERATOR.blankPayloadSource(),
        VERIFY_TEST_GENERATOR.idempotencyKey(),
        VERIFY_TEST_GENERATOR.runToken(),
      ),
      async ([blankPayload, key, run]) => {
        const { deps } = createVerifyAppendScenario(scenario);
        const appended = await command(
          verifyAppendOptions(scenario, { run, payload: blankPayload, idempotencyKey: key }),
          deps,
        );
        expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(appended.output).toBe(VERIFY_CLI_ERROR.PAYLOAD_REQUIRED);
      },
    );
  }
}

export async function assertStartRequiresNonBlankInputSource(): Promise<void> {
  const scenario = createVerifyRunContextScenario();

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.blankInputSource(), async (blankInput) => {
    const fs = createInMemoryStateStoreFileSystem();
    const started = await verifyStartCommand(
      { ...verifyStartOptions(scenario), input: blankInput },
      verifyDeps(scenario, fs),
    );
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(started.output).toBe(VERIFY_CLI_ERROR.INPUT_REQUIRED);
  });
}

export async function assertStartCreatesRunContextAndLocator(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();

  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseStartReport(started.output);
  expect(report.runToken.length).toBeGreaterThan(0);
  const expectedContext = scenarioContextDocument(scenario);
  expect(report.contextDigest).toBe(expectedContext.digest);
  await expect(fs.readFile(scenarioContextFilePath(scenario), STATE_STORE_TEXT_ENCODING)).resolves.toBe(
    expectedContext.canonicalJson,
  );
  expect(report.changedScope).toEqual(pathsFromNameStatus(scenario.nameStatusStdout));
  expect(report.input.source).toBe(VERIFY_INPUT_SOURCE.STDIN);
  expect(report.input.digest).toBe(expectedRunInputDigest(scenario));
  expect(report.locator.runToken).toBe(report.runToken);
  expect(report.locator.verificationType).toBe(scenario.verificationType);
  expect(report.locator.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
  expect(report.locator.scopeIdentity).toBe(scenario.scope);
  expect(report.locator.runTarget.length).toBeGreaterThan(0);
}

export async function assertChangesetScopeDerivesChangedFiles(): Promise<void> {
  const base = createVerifyRunContextScenario();
  await assertVerifyProperty(
    fc.tuple(VERIFY_TEST_GENERATOR.changesetRange(), VERIFY_TEST_GENERATOR.changedPaths()),
    async ([range, changedPaths]) => {
      const scenario = withChangedPaths(withScope(base, range.base, range.head), changedPaths);
      expect((await startReportFor(scenario)).changedScope).toEqual(
        pathsFromNameStatus(formatNameStatusZ(changedPaths)),
      );
    },
  );
}

export async function assertChangesetReconstructionChangesContextDigest(): Promise<void> {
  const base = createVerifyRunContextScenario();
  await assertVerifyProperty(
    fc.tuple(VERIFY_TEST_GENERATOR.changesetRange(), VERIFY_TEST_GENERATOR.changesetRange())
      .filter(([first, second]) => first.base !== second.base || first.head !== second.head),
    async ([first, second]) => {
      const firstScenario = withScope(base, first.base, first.head);
      const secondScenario = withScope(base, second.base, second.head);
      const firstStarted = await startVerifyRun(firstScenario);
      const secondStarted = await startVerifyRun(secondScenario);
      const firstContext = await readScenarioContext(firstScenario, firstStarted.fs);
      const secondContext = await readScenarioContext(secondScenario, secondStarted.fs);
      expect(firstContext.context.subject).toEqual({
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
        base: first.base,
        head: first.head,
      });
      expect(secondContext.context.subject).toEqual({
        kind: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
        base: second.base,
        head: second.head,
      });
      expect(firstContext.digest).toBe(firstStarted.report.contextDigest);
      expect(secondContext.digest).toBe(secondStarted.report.contextDigest);
      expect(secondStarted.report.contextDigest).not.toBe(firstStarted.report.contextDigest);
    },
  );
}

export async function assertChangedPathsStayOutsideContextDigest(): Promise<void> {
  const base = createVerifyRunContextScenario();
  await assertVerifyProperty(
    fc.tuple(VERIFY_TEST_GENERATOR.changesetRange(), VERIFY_TEST_GENERATOR.changedPathsPair()),
    async ([range, pair]) => {
      const scoped = withScope(base, range.base, range.head);
      const first = await startReportFor(withChangedPaths(scoped, pair.first));
      const second = await startReportFor(withChangedPaths(scoped, pair.second));
      expect(second.contextDigest).toBe(first.contextDigest);
      expect(second.changedScope).not.toEqual(first.changedScope);
    },
  );
}

export async function assertRunLocatorMapsResolvedSelectors(): Promise<void> {
  const base = createVerifyRunContextScenario();
  await assertVerifyProperty(
    fc.tuple(VERIFY_TEST_GENERATOR.verificationType(), VERIFY_TEST_GENERATOR.changesetRange()),
    async ([verificationType, range]) => {
      const scenario = withVerificationType(withScope(base, range.base, range.head), verificationType);
      const started = await startVerifyRun(scenario);
      const namespace = scenarioRunsDir(scenario);
      expect(started.report.locator).toEqual({
        runToken: started.report.runToken,
        verificationType,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        scopeIdentity: scenario.scope,
        backendIdentity: JOURNAL_BACKEND.LOCAL,
        storageNamespace: namespace,
        runTarget: join(namespace, runFileName(started.report.runToken)),
      });
      await expect(started.fs.lstat(started.report.locator.runTarget)).resolves.toMatchObject({});
    },
  );
}

export async function assertWorkingTreeScopeIsRejected(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const started = await verifyStartCommand(
    { ...verifyStartOptions(scenario), scopeType: VERIFY_SCOPE_TYPE.WORKING_TREE },
    verifyDeps(scenario, createInMemoryStateStoreFileSystem()),
  );
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
}

export async function assertStartFromNestedDirectoryUsesProductRelativeChangedScope(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const nestedCwd = join(scenario.productDir, sampleLiteralTestValue(arbitrarySourceFilePath()));
  const recording = createChangedScopeCwdRecordingGitDeps(scenario);

  const started = await verifyStartCommand(
    verifyStartOptions(scenario),
    { ...verifyDeps(scenario, fs), cwd: nestedCwd, git: recording.git },
  );

  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseStartReport(started.output).changedScope).toEqual(pathsFromNameStatus(scenario.nameStatusStdout));
  expect(recording.changedScopeCwd()).toBe(scenario.productDir);
}

export async function assertStartFromLinkedWorktreeSeparatesStateAndDiffRoots(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const worktreeRoot = join(scenario.productDir, "linked-worktree");
  const nestedCwd = join(worktreeRoot, sampleLiteralTestValue(arbitrarySourceFilePath()));
  let changedScopeCwd: string | undefined;
  const git: GitDependencies = {
    execa: async (command, args, options) => {
      const argLine = args.join(" ");
      if (argLine === GIT_SHOW_TOPLEVEL_ARGS.join(" ")) return gitSuccess(worktreeRoot);
      if (argLine === GIT_COMMON_DIR_ARGS.join(" ")) {
        return gitSuccess(join(scenario.productDir, GIT_DIR_BASENAME));
      }
      if (args.includes(GIT_NAME_STATUS_FLAG)) changedScopeCwd = options?.cwd;
      return verifyGitDeps(scenario).execa(command, args, options);
    },
  };

  const started = await verifyStartCommand(
    verifyStartOptions(scenario),
    { ...verifyDeps(scenario, fs), cwd: nestedCwd, git },
  );

  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(changedScopeCwd).toBe(worktreeRoot);
  expect(parseStartReport(started.output).locator.runTarget).toContain(scenario.productDir);
}

export async function assertStartPersistsRunJournalAtLocatorTarget(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();

  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));

  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseStartReport(started.output);
  expect(report.locator.runTarget).toContain(report.runToken);
  await expect(fs.readFile(report.locator.runTarget, STATE_STORE_TEXT_ENCODING)).resolves.toBeDefined();
}

export async function assertInputRequiresNonBlankRunToken(): Promise<void> {
  const scenario = createVerifyRunContextScenario();

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.blankRunToken(), async (blankRun) => {
    const fs = createInMemoryStateStoreFileSystem();
    const replayed = await verifyInputCommand(verifyInputOptions(scenario, blankRun), verifyDeps(scenario, fs));
    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toBe(VERIFY_CLI_ERROR.RUN_REQUIRED);
  });
}

export async function assertInputRejectsTypeScopeSelectionWithoutRunToken(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);

  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

  await assertVerifyProperty(VERIFY_TEST_GENERATOR.blankRunToken(), async (blankRun) => {
    const replayed = await verifyInputCommand(verifyInputOptions(scenario, blankRun), deps);
    expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(replayed.output).toBe(VERIFY_CLI_ERROR.RUN_REQUIRED);
  });
}

export async function assertInputRejectsUnsupportedVerificationTypeBeforeExistingRunLookup(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const recorder = createRecordingGitDeps();
  const deps: VerifyCliDeps = { ...verifyDeps(scenario, fs), git: recorder.git };
  const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
  const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());

  const replayed = await verifyInputCommand(
    { ...verifyInputOptions(scenario, runToken), verificationType: unsupportedType },
    deps,
  );

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(replayed.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  expect(recorder.calls()).toBe(0);
}

export async function assertInputReportsSelectorAndTargetForMissingRun(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);
  const missingRunToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());

  const replayed = await verifyInputCommand(verifyInputOptions(scenario, missingRunToken), deps);

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(replayed.output).toContain(missingRunToken);
  expect(replayed.output).toContain(scenario.verificationType);
  expect(replayed.output).toContain(VERIFY_SCOPE_TYPE.CHANGESET);
  expect(replayed.output).toContain(scenario.scope);
  expect(replayed.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.BACKEND}${JOURNAL_BACKEND.LOCAL}`);
  expect(replayed.output).toContain(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.NAMESPACE);
  expect(replayed.output).toContain(VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET);
  expect(replayed.output).toContain(verifyInputRecordFilePath(scenario, missingRunToken));
  expect(replayed.output).toContain(
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE_TYPE}${VERIFY_SCOPE_TYPE.CHANGESET}`,
  );
  expect(replayed.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE}${scenario.scope}`);
}

export async function assertInputRejectsRecordedScopeMismatch(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);

  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const { runToken } = parseStartReport(started.output);

  const replayed = await verifyInputCommand(
    { ...verifyInputOptions(scenario, runToken), scope: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}` },
    deps,
  );

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(replayed.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
  expect(replayed.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
  expect(replayed.output).toContain(verifyInputRecordFilePath(scenario, runToken));
}

export async function assertInputReplaysRecordedInput(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);

  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);

  const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const inputReport = parseInputReport(replayed.output);
  expect(inputReport.content).toBe(scenario.inputContent);
  expect(inputReport.source).toBe(startReport.input.source);
  expect(inputReport.digest).toBe(startReport.input.digest);
}

export async function assertInputDoesNotReadFreshInputSource(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);

  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);

  const reader = createRecordingInputReader();
  const replayDeps: VerifyCliDeps = { ...deps, readInputSource: reader.read };
  const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), replayDeps);

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseInputReport(replayed.output).content).toBe(scenario.inputContent);
  expect(reader.calls()).toBe(0);
}

export async function assertInputReportsReadFailureForRecordMissingSelectorFields(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);

  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);

  const malformedRecord = {
    source: startReport.input.source,
    digest: startReport.input.digest,
    content: scenario.inputContent,
  };
  await fs.writeFile(verifyInputRecordFilePath(scenario, startReport.runToken), JSON.stringify(malformedRecord));

  const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(replayed.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
}

export async function assertInputReportsReadFailureForInvalidRecordJson(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);

  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const invalidJson = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.inputPayload())).slice(0, -1);
  await fs.writeFile(verifyInputRecordFilePath(scenario, startReport.runToken), invalidJson);

  const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);

  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(replayed.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
}

export async function assertStartRejectsUnsupportedVerificationTypeBeforeOpeningRun(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
  const started = await verifyStartCommand(
    { ...verifyStartOptions(scenario), verificationType: unsupportedType },
    verifyDeps(scenario, fs),
  );
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  await expect(fs.lstat(join(scenario.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR))).rejects.toThrow(
    ERROR_CODE_NOT_FOUND,
  );
}

export async function assertStartRejectsChangedScopeFailureBeforeOpeningRun(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = verifyDeps(scenario, fs);
  const failingDeps = { ...deps, git: failChangedScopeGitDeps(verifyGitDeps(scenario)) };
  const started = await verifyStartCommand(verifyStartOptions(scenario), failingDeps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toContain(VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED);
  await expect(fs.lstat(join(scenario.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR))).rejects.toThrow(
    ERROR_CODE_NOT_FOUND,
  );
  const replayed = await verifyInputCommand(
    verifyInputOptions(scenario, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken())),
    deps,
  );
  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(replayed.output).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
}

export async function assertStartReportsInputReadFailuresBeforeOpeningRun(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const deps = {
    ...verifyDeps(scenario, fs),
    readInputSource: async () => {
      throw new Error(scenario.inputContent);
    },
  };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
  await expect(fs.lstat(join(scenario.productDir, STATE_STORE_SCOPE_PATH.SPX_DIR))).rejects.toThrow(
    ERROR_CODE_NOT_FOUND,
  );
}

export async function assertStartRemovesVerificationContextWhenJournalOpenFails(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createJournalOpenFailureFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  await expect(fs.lstat(scenarioContextFilePath(scenario))).rejects.toThrow(ERROR_CODE_NOT_FOUND);
}

export async function assertStartPreservesReusedVerificationContextWhenJournalOpenFails(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const created = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(created.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const started = await verifyStartCommand(
    verifyStartOptions(scenario),
    verifyDeps(scenario, createJournalOpenFailureFileSystem(fs)),
  );
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  await expect(fs.lstat(scenarioContextFilePath(scenario))).resolves.toMatchObject({});
}

export async function assertStartRemovesOpenedRunArtifactsWhenInputPersistenceFails(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInputPersistFailureFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED);
  const runEntries = await fs.readdir(scenarioRunsDir(scenario), { withFileTypes: true });
  expect(runEntries).toHaveLength(0);
  await expect(fs.lstat(scenarioContextFilePath(scenario))).rejects.toThrow(ERROR_CODE_NOT_FOUND);
}

export async function assertStartPreservesReusedVerificationContextWhenInputPersistenceFails(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const created = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(created.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const started = await verifyStartCommand(
    verifyStartOptions(scenario),
    verifyDeps(scenario, createInputPersistFailureFileSystem(fs)),
  );
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toContain(VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED);
  await expect(fs.lstat(scenarioContextFilePath(scenario))).resolves.toMatchObject({});
}

export async function assertStartRemovesOpenedRunArtifactsWhenRunContextFails(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createRunContextAppendFailureFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toContain(VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED);
  const runEntries = await fs.readdir(scenarioRunsDir(scenario), { withFileTypes: true });
  expect(runEntries).toHaveLength(0);
  await expect(fs.lstat(scenarioContextFilePath(scenario))).rejects.toThrow(ERROR_CODE_NOT_FOUND);
}

export async function assertStartPreservesReusedVerificationContextWhenRunContextFails(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const created = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(created.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const started = await verifyStartCommand(
    verifyStartOptions(scenario),
    verifyDeps(scenario, createRunContextAppendFailureFileSystem(fs)),
  );
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(started.output).toContain(VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED);
  await expect(fs.lstat(scenarioContextFilePath(scenario))).resolves.toMatchObject({});
}

export async function assertStartRecordsInputForInputReplay(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const laterInputContent = `${scenario.inputContent}${scenario.scope}`;
  let currentInputContent = scenario.inputContent;
  const deps = {
    ...verifyDeps(scenario, fs),
    readInputSource: async () => currentInputContent,
  };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  currentInputContent = laterInputContent;
  const replayed = await verifyInputCommand(verifyInputOptions(scenario, startReport.runToken), deps);
  expect(replayed.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseInputReport(replayed.output).content).toBe(scenario.inputContent);
}

export async function assertStartReportsPersistableRunLocator(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const started = await verifyStartCommand(verifyStartOptions(scenario), verifyDeps(scenario, fs));
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseStartReport(started.output);
  const runEntries = await fs.readdir(scenarioRunsDir(scenario), { withFileTypes: true });
  const runFileEntries = runEntries.filter((entry) => entry.isFile() && entry.name === runFileName(report.runToken));
  expect(runFileEntries).toHaveLength(1);
  expect(report.locator).toEqual({
    runToken: report.runToken,
    verificationType: scenario.verificationType,
    scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
    scopeIdentity: scenario.scope,
    backendIdentity: JOURNAL_BACKEND.LOCAL,
    storageNamespace: scenarioRunsDir(scenario),
    runTarget: join(scenarioRunsDir(scenario), runFileEntries[0]?.name),
  });
  await expect(fs.lstat(report.locator.runTarget)).resolves.toMatchObject({});
}

export async function assertAppendRejectsUnsupportedScopeTypesBeforePayloadRead(): Promise<void> {
  const { scenario, fs, deps: baseDeps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
  const deps = {
    ...baseDeps,
    readPayloadSource: async () => {
      throw new Error(payload);
    },
  };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const { runToken } = parseStartReport(started.output);
  const eventsBeforeRejectedAppends = await readVerifyRunEvents(scenario, runToken, fs);

  for (const command of APPEND_COMMANDS) {
    const appended = await command(
      {
        ...verifyAppendOptions(scenario, {
          run: runToken,
          payload,
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        scopeType: VERIFY_SCOPE_TYPE.WORKING_TREE,
      },
      deps,
    );

    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(appended.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toStrictEqual(eventsBeforeRejectedAppends);
  }
}

export async function assertAppendRejectsMalformedChangesetScopesBeforePayloadRead(): Promise<void> {
  const { scenario, fs, deps: baseDeps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
  const deps = {
    ...baseDeps,
    readPayloadSource: async () => {
      throw new Error(payload);
    },
  };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const { runToken } = parseStartReport(started.output);
  const eventsBeforeRejectedAppends = await readVerifyRunEvents(scenario, runToken, fs);

  for (const command of APPEND_COMMANDS) {
    const appended = await command(
      {
        ...verifyAppendOptions(scenario, {
          run: runToken,
          payload,
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        scope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangesetScope()),
      },
      deps,
    );

    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(appended.output).toBe(VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toStrictEqual(eventsBeforeRejectedAppends);
  }
}

export async function assertAppendPayloadChannelDoesNotReuseRunInput(): Promise<void> {
  const { scenario, fs, deps: baseDeps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const inputReader = createRecordingInputReader();
  const deps = { ...baseDeps, readInputSource: inputReader.read };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const { runToken } = parseStartReport(started.output);
  const inputReadsAfterStart = inputReader.calls();
  const scopePayload = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload());
  const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const appended = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload: JSON.stringify(scopePayload), idempotencyKey: key }),
    deps,
  );

  expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(inputReader.calls()).toBe(inputReadsAfterStart);
  const scopeEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
    (event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE,
  );
  expect(scopeEvents).toHaveLength(1);
  expect(scopeEvents[0]?.data).toEqual({
    [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: key,
    [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: scopePayload,
  });
}

export async function assertAppendIdempotencyKeyRequiredForEveryAppendVerb(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));

  for (const command of APPEND_COMMANDS) {
    await assertVerifyProperty(
      fc.tuple(VERIFY_TEST_GENERATOR.blankIdempotencyKey(), VERIFY_TEST_GENERATOR.runToken()),
      async ([blankKey, run]) => {
        const { deps } = createVerifyAppendScenario(scenario);
        const appended = await command(
          verifyAppendOptions(scenario, { run, payload, idempotencyKey: blankKey }),
          deps,
        );
        expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(appended.output).toBe(VERIFY_CLI_ERROR.IDEMPOTENCY_KEY_REQUIRED);
      },
    );
  }
}

export async function assertAppendRejectsUnsupportedVerificationTypesBeforePayloadRead(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
  const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
  const deps = {
    ...createVerifyAppendScenario(scenario).deps,
    readPayloadSource: async () => {
      throw new Error(payload);
    },
  };

  for (const command of APPEND_COMMANDS) {
    const appended = await command(
      {
        ...verifyAppendOptions(scenario, {
          run: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken()),
          payload,
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        verificationType: unsupportedType,
      },
      deps,
    );

    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(appended.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  }
}

export async function assertAppendIdempotencyReturnsExistingSequenceForRepeatedKey(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const keys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
  const first = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload, idempotencyKey: keys.first }),
    deps,
  );
  expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const firstReport = parseAppendReport(first.output);
  expect(firstReport.idempotent).toBe(false);
  expect(countAppendEvents(await readVerifyRunEvents(scenario, runToken, fs))).toBe(1);

  const repeat = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload, idempotencyKey: keys.first }),
    deps,
  );
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const repeatReport = parseAppendReport(repeat.output);
  expect(repeatReport.sequence).toBe(firstReport.sequence);
  expect(repeatReport.idempotent).toBe(true);
  expect(countAppendEvents(await readVerifyRunEvents(scenario, runToken, fs))).toBe(1);

  const fresh = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload, idempotencyKey: keys.second }),
    deps,
  );
  expect(fresh.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const freshReport = parseAppendReport(fresh.output);
  expect(freshReport.idempotent).toBe(false);
  expect(freshReport.sequence).toBeGreaterThan(firstReport.sequence);
  expect(countAppendEvents(await readVerifyRunEvents(scenario, runToken, fs))).toBe(2);
}

export async function assertFindingEvidenceDeduplicatesByIdempotencyKey(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
  const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const options = verifyAppendOptions(scenario, {
    run: runToken,
    payload: JSON.stringify(finding),
    idempotencyKey: key,
  });

  const first = await verifyAppendFindingCommand(options, deps);
  expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const repeat = await verifyAppendFindingCommand(options, deps);
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseAppendReport(repeat.output).sequence).toBe(parseAppendReport(first.output).sequence);
  const findingEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
    (event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING,
  );
  expect(findingEvents).toHaveLength(1);
}

export async function assertIdempotencyKeysDoNotCollideAcrossAppendKinds(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const sharedKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
  const scopePayload = JSON.stringify({
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
    coverageState: REVIEW_SCOPE_COVERAGE_STATE.CLEAN,
  });
  const findingPayload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding()));
  const scopeAppend = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: sharedKey }),
    deps,
  );
  const findingAppend = await verifyAppendFindingCommand(
    verifyAppendOptions(scenario, { run: runToken, payload: findingPayload, idempotencyKey: sharedKey }),
    deps,
  );

  expect(scopeAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(findingAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseAppendReport(findingAppend.output).idempotent).toBe(false);
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  expect(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
  expect(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
}

export async function assertAppendRejectsEvidenceAfterTerminalCompletion(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
  const eventsBeforeReject = await readVerifyRunEvents(scenario, runToken, fs);

  for (const append of APPEND_COMMANDS) {
    const rejected = await append(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(rejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(rejected.output).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
  }

  const eventsAfterReject = await readVerifyRunEvents(scenario, runToken, fs);
  expect(eventsAfterReject).toEqual(eventsBeforeReject);
  expect(eventsAfterReject.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(
    findings.length,
  );
}

export async function assertAppendOnTerminalRunDoesNotRequireRecordedInputSidecar(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  await finishRun(scenario, deps, runToken, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus()));
  await fs.rm(verifyInputRecordFilePath(scenario, runToken), { force: true });

  for (const append of APPEND_COMMANDS) {
    const rejected = await append(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(rejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(rejected.output).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
  }
}

export async function assertAppendOnTerminalRunDoesNotMatchRecordedInputSelectors(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  await finishRun(scenario, deps, runToken, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus()));
  await fs.writeFile(
    verifyInputRecordFilePath(scenario, runToken),
    JSON.stringify({
      scopeIdentity: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      source: scenario.inputContent,
      digest: runToken,
      content: scenario.inputContent,
    }),
  );

  for (const append of APPEND_COMMANDS) {
    const rejected = await append(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(rejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(rejected.output).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
  }
}

export async function assertFinishRecordsTerminalCompletionAndRejectsFurtherEvidence(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const runToken = startReport.runToken;
  const keys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
  const scopePayload = JSON.stringify({
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
    coverageState: REVIEW_SCOPE_COVERAGE_STATE.CLEAN,
  });
  const scopeAppend = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: keys.first }),
    deps,
  );
  expect(scopeAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
  const finished = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
  if (finished.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    throw new Error(`verify finish failed in rejected terminal scenario: ${finished.output}`);
  }

  const report = parseFinishReport(finished.output);
  expect(report.runToken).toBe(runToken);
  expect(report.sealed).toBe(true);
  expect(report.terminalStatus).toBe(terminalStatus);
  expect(report.findingCount).toBe(findings.length);
  const events = await readVerifyRunEvents(scenario, runToken, fs);
  expect(findTerminalEvent(events)).toBeDefined();
  expect(report.lastSequence).toBe(events.length);
  await expect(
    fs.readFile(appendableJournalSealMarkerPath(startReport.locator.runTarget), STATE_STORE_TEXT_ENCODING),
  ).resolves.toBe(APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT);

  const afterFinish = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: keys.second }),
    deps,
  );
  expect(afterFinish.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(afterFinish.output).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
}

export async function assertRenderSealedRunProjectionReadOnly(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
  await finishRun(scenario, deps, runToken, terminalStatus);

  const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);
  const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseRenderReport(rendered.output);
  expect(report.runToken).toBe(runToken);
  expect(report.sealed).toBe(true);
  expect(report.terminalStatus).toBe(terminalStatus);
  expect(report.findingCount).toBe(findings.length);
  expect(report.events).toHaveLength(eventsBeforeRender.length);
  expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length);
}

export async function assertRenderUnsealedRunReadOnlyAndUnsealed(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);
  const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseRenderReport(rendered.output);
  expect(report.runToken).toBe(runToken);
  expect(report.sealed).toBe(false);
  expect(report.terminalStatus).toBeUndefined();
  expect(report.findingCount).toBe(findings.length);
  expect(report.events).toHaveLength(eventsBeforeRender.length);
  expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length);

  const appendAfterRender = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  expect(appendAfterRender.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length + 1);
}

export async function assertStatusStartedRunProjection(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const scopeAppend = await verifyAppendScopeCommand(
    verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    }),
    deps,
  );
  expect(scopeAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseStatusReport(status.output);
  expect(report.runToken).toBe(runToken);
  expect(report.verificationType).toBe(scenario.verificationType);
  expect(report.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
  expect(report.sealed).toBe(false);
  expect(report.terminalStatus).toBeUndefined();
  const expectedUnsealedActions = [
    VERIFY_LIFECYCLE_ACTION.SCOPE_ADD,
    VERIFY_LIFECYCLE_ACTION.FINDING_ADD,
    VERIFY_LIFECYCLE_ACTION.FINISH,
  ];
  expect(new Set(report.nextActions)).toEqual(new Set(expectedUnsealedActions));
  expect(report.nextActions).toHaveLength(expectedUnsealedActions.length);
  expect(report.lastSequence).toBe((await readVerifyRunEvents(scenario, runToken, fs)).length);
}

export async function assertStatusFinishedRunProjection(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  await finishRun(scenario, deps, runToken, terminalStatus);
  const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const report = parseStatusReport(status.output);
  expect(report.sealed).toBe(true);
  expect(report.terminalStatus).toBe(terminalStatus);
  expect(report.nextActions).toHaveLength(0);
  expect(report.lastSequence).toBe((await readVerifyRunEvents(scenario, runToken, fs)).length);
}

export async function assertFinishStatusAndRenderShareFindingProjection(): Promise<void> {
  const { scenario, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
  const finishReport = await finishRun(scenario, deps, runToken, terminalStatus);
  const statusReport = parseStatusReport(
    (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
  );
  const renderReport = parseRenderReport(
    (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
  );
  expect(finishReport.findingCount).toBe(findings.length);
  expect(statusReport.findingCount).toBe(findings.length);
  expect(renderReport.findingCount).toBe(findings.length);
  expect(finishReport.runToken).toBe(runToken);
  expect(statusReport.runToken).toBe(runToken);
  expect(renderReport.runToken).toBe(runToken);
}

export async function assertFinishStatusAndRenderProjectTerminalMetadata(): Promise<void> {
  const { scenario, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const terminalMetadata = {
    ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadataWithProvider()),
    body: "",
  };
  const terminalMetadataPayload = { ...terminalMetadata, ignored: scenario.inputContent };
  const finish = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, { run: runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.APPROVED }),
      terminalMetadata: JSON.stringify(terminalMetadataPayload),
    },
    deps,
  );
  expect(finish.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const finishReport = parseFinishReport(finish.output);
  const statusReport = parseStatusReport(
    (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
  );
  const renderReport = parseRenderReport(
    (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
  );
  expect(finishReport.terminalMetadata).toEqual(terminalMetadata);
  expect(statusReport.terminalMetadata).toEqual(terminalMetadata);
  expect(renderReport.terminalMetadata).toEqual(terminalMetadata);
}

export async function assertStatusAndRenderHydrateWithoutRecordedInput(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
  await finishRun(scenario, deps, runToken, terminalStatus);
  await fs.rm(verifyInputRecordFilePath(scenario, runToken), { force: true });
  const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
  const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const statusReport = parseStatusReport(status.output);
  const renderReport = parseRenderReport(rendered.output);
  expect(statusReport.runToken).toBe(runToken);
  expect(renderReport.runToken).toBe(runToken);
  expect(statusReport.findingCount).toBe(findings.length);
  expect(renderReport.findingCount).toBe(findings.length);
  expect(statusReport.terminalStatus).toBe(terminalStatus);
  expect(renderReport.terminalStatus).toBe(terminalStatus);
}

export async function assertStatusAndRenderHydrateWithMalformedRecordedInput(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const findings = await appendFindingBatch(scenario, deps, runToken);
  const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
  await finishRun(scenario, deps, runToken, terminalStatus);
  await fs.writeFile(
    verifyInputRecordFilePath(scenario, runToken),
    JSON.stringify({ source: terminalStatus, digest: runToken, content: scenario.inputContent }),
  );
  const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
  const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const statusReport = parseStatusReport(status.output);
  const renderReport = parseRenderReport(rendered.output);
  expect(statusReport.findingCount).toBe(findings.length);
  expect(renderReport.findingCount).toBe(findings.length);
  expect(statusReport.terminalStatus).toBe(terminalStatus);
  expect(renderReport.terminalStatus).toBe(terminalStatus);
}

export async function assertStatusAndRenderRejectMismatchedTerminalRecordedInput(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  await finishRun(scenario, deps, runToken, terminalStatus);
  await fs.writeFile(
    verifyInputRecordFilePath(scenario, runToken),
    JSON.stringify({
      scopeIdentity: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      source: scenario.inputContent,
      digest: runToken,
      content: scenario.inputContent,
    }),
  );
  const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
  const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(status.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
  expect(rendered.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
  expect(status.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
  expect(rendered.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
  expect(status.output).toContain(verifyInputRecordFilePath(scenario, runToken));
  expect(rendered.output).toContain(verifyInputRecordFilePath(scenario, runToken));
}

export async function assertStatusAndRenderRejectRawUnterminalRun(): Promise<void> {
  const { scenario, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const rawRun = await openRawJournalRun(scenario, deps);
  const status = await verifyStatusCommand(verifyStatusOptions(scenario, rawRun.runToken), deps);
  const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, rawRun.runToken), deps);
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(status.output).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
  expect(rendered.output).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
  expect(status.output).toContain(verifyInputRecordFilePath(scenario, rawRun.runToken));
  expect(rendered.output).toContain(verifyInputRecordFilePath(scenario, rawRun.runToken));
}

export async function assertStatusAndRenderRejectUnsupportedVerificationType(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const { deps } = createVerifyAppendScenario(scenario);
  const recorder = createRecordingGitDeps();
  const recordingDeps = { ...deps, git: recorder.git };
  const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
  const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
  const status = await verifyStatusCommand(
    { ...verifyStatusOptions(scenario, runToken), verificationType: unsupportedType },
    recordingDeps,
  );
  const rendered = await verifyRenderCommand(
    { ...verifyRenderOptions(scenario, runToken), verificationType: unsupportedType },
    recordingDeps,
  );
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(status.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  expect(rendered.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  expect(recorder.calls()).toBe(0);
}

export async function assertStatusAndRenderRejectRequestedScopeMismatch(): Promise<void> {
  const { scenario, deps } = createVerifyAppendScenario(
    withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
  );
  const runToken = await startedRunToken(scenario, deps);
  const mismatchedScope = `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`;
  const status = await verifyStatusCommand(
    { ...verifyStatusOptions(scenario, runToken), scope: mismatchedScope },
    deps,
  );
  const rendered = await verifyRenderCommand(
    { ...verifyRenderOptions(scenario, runToken), scope: mismatchedScope },
    deps,
  );
  expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(status.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
  expect(rendered.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
  expect(status.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
  expect(rendered.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
  expect(status.output).toContain(verifyInputRecordFilePath(scenario, runToken));
  expect(rendered.output).toContain(verifyInputRecordFilePath(scenario, runToken));
}

export async function assertRepeatedFinishReturnsExistingProjection(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const runToken = await startedRunToken(scenario, deps);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const first = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
  expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const repeat = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  await assertFinishReportMatchesJournal(parseFinishReport(repeat.output), scenario, fs, runToken, terminalStatus);
  singleTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs));
}

export async function assertRepeatedFinishRetriesPhysicalSeal(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createSealRetryFileSystem();
  const deps = createVerifyAppendScenario(scenario).deps;
  const retryDeps = { ...deps, fs };
  const started = await verifyStartCommand(verifyStartOptions(scenario), retryDeps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);
  fs.failFirstSealWriteAt(sealMarkerPath);
  const first = await verifyFinishCommand(
    verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
    retryDeps,
  );
  expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(first.output).toContain(VERIFY_CLI_ERROR.SEAL_FAILED);
  expect(findTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs))).toBeDefined();
  await fs.rm(verifyInputRecordFilePath(scenario, startReport.runToken), { force: true });
  fs.failDirectoryListings();
  const repeat = await verifyFinishCommand(
    verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
    retryDeps,
  );
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  expect(parseFinishReport(repeat.output).terminalStatus).toBe(terminalStatus);
  await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).resolves.toBe(
    APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  );
}

export async function assertRepeatedFinishProjectsWhenSealMarkerUnreadable(): Promise<void> {
  const scenario = createReviewVerifyRunContextScenario();
  const fs = createSealRetryFileSystem();
  const deps = { ...createVerifyAppendScenario(scenario).deps, fs };
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  await finishRun(scenario, deps, startReport.runToken, terminalStatus);
  fs.failSealMarkerReadsAt(appendableJournalSealMarkerPath(startReport.locator.runTarget));
  const repeat = await verifyFinishCommand(
    verifyFinishOptions(scenario, { run: startReport.runToken, terminalStatus }),
    deps,
  );
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  await assertFinishReportMatchesJournal(
    parseFinishReport(repeat.output),
    scenario,
    fs,
    startReport.runToken,
    terminalStatus,
  );
  singleTerminalEvent(await readVerifyRunEvents(scenario, startReport.runToken, fs));
}

export async function assertFinishRejectsRawUnterminalRun(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const { fs, deps } = createVerifyAppendScenario(scenario);
  const rawRun = await openRawJournalRun(scenario, deps);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const finished = await verifyFinishCommand(
    verifyFinishOptions(scenario, { run: rawRun.runToken, terminalStatus }),
    deps,
  );
  expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(finished.output).toContain(rawRun.runToken);
  expect(finished.output).toContain(verifyInputRecordFilePath(scenario, rawRun.runToken));
  expect(findTerminalEvent(await readVerifyRunEvents(scenario, rawRun.runToken, fs))).toBeUndefined();
}

export async function assertSecondFinishKeepsFirstProjection(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const runToken = await startedRunToken(scenario, deps);
  const statuses = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.distinctTerminalStatuses());
  await finishRun(scenario, deps, runToken, statuses.first);
  const second = await finishRun(scenario, deps, runToken, statuses.second);
  expect(second.terminalStatus).toBe(statuses.first);
  await assertFinishReportMatchesJournal(second, scenario, fs, runToken, statuses.first);
  expect(JSON.stringify(singleTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs)).data)).not.toContain(
    statuses.second,
  );
}

export async function assertFinishProjectionWorksWithoutJournalBinding(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const runToken = await startedRunToken(scenario, deps);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  await finishRun(scenario, deps, runToken, terminalStatus);
  await fs.writeFile(
    verifyInputRecordFilePath(scenario, runToken),
    JSON.stringify({ source: terminalStatus, digest: runToken, content: scenario.inputContent }),
  );
  const readOnlyDeps = verifyDeps(scenario, fs);
  const repeat = await verifyFinishCommand(
    verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
    readOnlyDeps,
  );
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  await assertFinishReportMatchesJournal(parseFinishReport(repeat.output), scenario, fs, runToken, terminalStatus);
}

export async function assertRepeatedFinishRejectsRecordedInputSelectorMismatch(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const runToken = startReport.runToken;
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  await finishRun(scenario, deps, runToken, terminalStatus);
  await fs.writeFile(
    verifyInputRecordFilePath(scenario, runToken),
    JSON.stringify({
      scopeIdentity: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`,
      scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
      source: VERIFY_INPUT_SOURCE.STDIN,
      digest: startReport.input.digest,
      content: scenario.inputContent,
    }),
  );
  const repeat = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
  expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(repeat.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
  singleTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs));
}

export async function assertFinishRejectsUnsupportedScopeAndMalformedScope(): Promise<void> {
  const { scenario, fs, deps } = createVerifyAppendScenario(createReviewVerifyRunContextScenario());
  const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
  expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
  const startReport = parseStartReport(started.output);
  const runToken = startReport.runToken;
  const sealMarkerPath = appendableJournalSealMarkerPath(startReport.locator.runTarget);
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const unsupportedType = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
      scopeType: VERIFY_SCOPE_TYPE.WORKING_TREE,
    },
    deps,
  );
  expect(unsupportedType.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(unsupportedType.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
  const malformedScope = await verifyFinishCommand(
    {
      ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
      scope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangesetScope()),
    },
    deps,
  );
  expect(malformedScope.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(malformedScope.output).toBe(VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET);
  expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
  await expect(fs.readFile(sealMarkerPath, STATE_STORE_TEXT_ENCODING)).rejects.toThrow();
  await finishRecoversUnsealedRun(scenario, deps, runToken);
}

export async function assertFinishRejectsUnsupportedVerificationTypeBeforeLookup(): Promise<void> {
  const scenario = createVerifyRunContextScenario();
  const fs = createInMemoryStateStoreFileSystem();
  const recorder = createRecordingGitDeps();
  const deps = { ...verifyDeps(scenario, fs), git: recorder.git };
  const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
  const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());
  const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
  const finished = await verifyFinishCommand(
    { ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }), verificationType: unsupportedType },
    deps,
  );
  expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
  expect(finished.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  expect(recorder.calls()).toBe(0);
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
