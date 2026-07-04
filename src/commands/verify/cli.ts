import { randomBytes } from "node:crypto";
import { dirname } from "node:path";

import {
  journalAppendCommand,
  journalOpenCommand,
  journalReadCommand,
  type JournalRunCliScope,
  journalSealCommand,
  type JournalStreamBinding,
  readJournalCliEnvironment,
} from "@/commands/journal/cli";
import { JOURNAL_RUNTIME_ERROR, listJournalRuns } from "@/commands/journal/runtime";
import { verificationContextCreateCommand } from "@/commands/verification-context/cli";
import type { CliCommandResult, Result } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import { type JournalEdgeBackend, resolveJournalBackend } from "@/domains/journal/backend-selection";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import {
  buildAppendEvent,
  buildRunLocator,
  buildTerminalEvent,
  type ChangesetScope,
  digestRunInput,
  findAppendedSequence,
  findingValidatorFor,
  findTerminalEvent,
  type InputDescriptor,
  isVerifyTerminalStatus,
  isVerifyVerificationType,
  parseAppendPayload,
  parseChangesetScope,
  projectVerifyRun,
  type RecordedInput,
  type RunLocator,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERB,
  type VerifyAppendEventType,
  verifyInputRecordPath,
  type VerifyRunProjection,
  type VerifyRunScope,
  verifyRunsDir,
} from "@/domains/verify/verify";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  GIT_ROOT_COMMAND,
  type GitDependencies,
} from "@/git/root";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import { writeFileAtomic } from "@/lib/atomic-file-write";
import { changesetNameStatusArgs, pathsFromNameStatus } from "@/lib/git/name-status";
import {
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  resolveBranchIdentity,
  slugBranchIdentity,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
} from "@/lib/state-store";
import { SPX_VERIFY_ENV, SPX_VERIFY_HEAD_SHA } from "@/lib/verification-env";

export const VERIFY_CLI_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
} as const;

export const VERIFY_CLI_ENV = {
  BRANCH: SPX_VERIFY_ENV.BRANCH,
} as const;

const VERIFY_RUN_LOOKUP_LIMIT = Number.MAX_SAFE_INTEGER;

export const VERIFY_CLI_ERROR = {
  INPUT_REQUIRED: "spx verification run start requires --input <input-source>",
  RUN_REQUIRED: "spx verification run existing-run commands require an explicit --run <run-token>",
  RUN_NOT_FOUND: "spx verification run could not locate the requested run",
  RUN_SELECTOR_MISMATCH: "spx verification run selector does not match the recorded run",
  CHANGED_SCOPE_FAILED: "spx verification run could not derive the changeset changed-file scope",
  INPUT_PERSIST_FAILED: "spx verification run could not persist the recorded run input",
  INPUT_READ_FAILED: "spx verification run could not read the recorded run input",
  PAYLOAD_REQUIRED: "spx verification run evidence-add commands require --payload <payload-source>",
  IDEMPOTENCY_KEY_REQUIRED: "spx verification run evidence-add commands require --idempotency-key <key>",
  PAYLOAD_READ_FAILED: "spx verification run could not read the evidence payload",
  PAYLOAD_INVALID: "spx verification run evidence payload is not valid JSON",
  RUN_FINISHED: "spx verification run cannot add evidence to a finished run",
  FINDING_INVALID: "spx verification run finding add payload failed verification-type validation",
  UNSUPPORTED_VERIFICATION_TYPE: "spx verification run verification type is not registered",
  APPEND_FAILED: "spx verification run could not append the evidence event",
  TERMINAL_STATUS_REQUIRED: "spx verification run finish requires --terminal-status <status>",
  TERMINAL_STATUS_INVALID:
    "spx verification run finish requires a terminal status in the journal terminal-status vocabulary",
  FINISH_FAILED: "spx verification run could not record terminal completion",
  SEAL_FAILED: "spx verification run could not seal the run journal",
  STATUS_FAILED: "spx verification run could not read the run status",
  RENDER_FAILED: "spx verification run could not render the run projection",
} as const;

export const VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD = {
  RUN: "run=",
  VERIFICATION_TYPE: "verification-type=",
  SCOPE_TYPE: "scope-type=",
  SCOPE: "scope=",
  BACKEND: "backend=",
  NAMESPACE: "namespace=",
  TARGET: "target=",
} as const;

export interface VerifyCliDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly readInputSource: (source: string) => Promise<string>;
  /** Reads the append payload from its `--payload` source; the append verbs require it. */
  readonly readPayloadSource?: (source: string) => Promise<string>;
  /** The journal streaming binding the descriptor injects; the append verbs stream through it. */
  readonly journalBinding?: JournalStreamBinding;
}

export interface VerifyStartCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly input: string;
}

export interface VerifyInputCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

export interface VerifyStartReport {
  readonly runToken: string;
  readonly contextDigest: string;
  readonly changedScope: readonly string[];
  readonly input: InputDescriptor;
  readonly locator: RunLocator;
}

export interface VerifyInputReport {
  readonly source: string;
  readonly digest: string;
  readonly content: string;
}

export interface VerifyAppendCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
  readonly payload: string;
  readonly idempotencyKey: string;
}

export interface VerifyAppendReport {
  readonly sequence: number;
  readonly idempotent: boolean;
}

export interface VerifyFinishCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
  readonly terminalStatus: string;
}

export interface VerifyStatusCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

export interface VerifyRenderCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

export interface VerifyFinishReport {
  readonly runToken: string;
  readonly terminalStatus?: string;
  readonly sealed: boolean;
  readonly findingCount: number;
  readonly lastSequence: number;
}

export interface VerifyStatusReport {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly sealed: boolean;
  readonly lastSequence: number;
  readonly terminalStatus?: string;
  readonly findingCount: number;
  readonly nextActions: readonly string[];
}

export interface VerifyRenderReport {
  readonly runToken: string;
  readonly findingCount: number;
  readonly sealed: boolean;
  readonly terminalStatus?: string;
  readonly events: readonly JournalEvent[];
}

interface VerifyResolvedScope {
  readonly productDir: string;
  readonly branchSlug: string;
  readonly backendIdentity: JournalEdgeBackend;
}

interface VerifyForwardedDeps {
  readonly cwd?: string;
  readonly git?: GitDependencies;
  readonly branch?: string;
  readonly processEnv?: NodeJS.ProcessEnv;
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
}

interface VerifyRunNotFoundContext {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scopeIdentity: string;
  readonly backendIdentity: string;
  readonly storageNamespace: string;
  readonly searchedTarget: string;
}

function okResult(output: string): CliCommandResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.OK, output };
}

function errorResult(error: string): CliCommandResult {
  return { exitCode: VERIFY_CLI_EXIT_CODE.ERROR, output: error };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : JSON.stringify(error);
}

/** Forward the shared resolution dependencies to the verification-context and journal substrate commands. */
function forwardDeps(deps: VerifyCliDeps): VerifyForwardedDeps {
  return {
    ...(deps.cwd === undefined ? {} : { cwd: deps.cwd }),
    ...(deps.git === undefined ? {} : { git: deps.git }),
    ...(deps.branch === undefined ? {} : { branch: deps.branch }),
    ...(deps.processEnv === undefined ? {} : { processEnv: deps.processEnv }),
    ...(deps.fs === undefined ? {} : { fs: deps.fs }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  };
}

/**
 * Resolve the run's product root, branch slug, and edge backend once from the shared
 * dependencies, so the journal run file, the input record, and the run locator all address
 * the same run identity.
 */
async function resolveVerifyScope(deps: VerifyCliDeps): Promise<Result<VerifyResolvedScope>> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const processEnv = deps.processEnv ?? process.env;
  const product = await detectGitCommonDirProductRoot(cwd, git);
  const probedBranch = product.isGitRepo ? (await getCurrentBranch(cwd, git)) ?? undefined : undefined;
  const headSha = (product.isGitRepo ? await getHeadSha(cwd, git) : null) ?? SPX_VERIFY_HEAD_SHA.MISSING;
  const branchName = deps.branch ?? processEnv[VERIFY_CLI_ENV.BRANCH] ?? probedBranch;
  const branchIdentity = resolveBranchIdentity({ ...(branchName === undefined ? {} : { branchName }), headSha });
  const backend = resolveJournalBackend(readJournalCliEnvironment(processEnv).backend);
  if (!backend.ok) return backend;
  return {
    ok: true,
    value: {
      productDir: product.productDir,
      branchSlug: slugBranchIdentity(branchIdentity),
      backendIdentity: backend.value,
    },
  };
}

/** Derive the changeset's changed product paths from a null-delimited name-status diff. */
async function resolveChangedScope(scope: ChangesetScope, deps: VerifyCliDeps): Promise<Result<readonly string[]>> {
  const cwd = deps.cwd ?? CONFIG_PROCESS_CWD.read();
  const git = deps.git ?? defaultGitDependencies;
  const diff = await git.execa(GIT_ROOT_COMMAND.EXECUTABLE, [...changesetNameStatusArgs(scope.base, scope.head)], {
    cwd,
    reject: false,
  });
  if (diff.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED}: ${diff.stderr}` };
  }
  return { ok: true, value: pathsFromNameStatus(diff.stdout) };
}

async function persistInputRecord(
  runScope: VerifyRunScope,
  record: RecordedInput,
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const path = verifyInputRecordPath(runScope);
  if (!path.ok) return path;
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  try {
    await fs.mkdir(dirname(path.value), { recursive: true });
    await writeFileAtomic(path.value, JSON.stringify(record), { fs, randomBytes });
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED}: ${toMessage(error)}` };
  }
}

function isStoredRecordedInput(value: unknown): value is RecordedInput {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<RecordedInput>;
  return (
    typeof record.scopeIdentity === "string"
    && typeof record.scopeType === "string"
    && typeof record.source === "string"
    && typeof record.digest === "string"
    && typeof record.content === "string"
  );
}

function parseRecordedInput(content: string): Result<RecordedInput> {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!isStoredRecordedInput(parsed)) {
      return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: recorded input is missing required fields` };
    }
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: ${toMessage(error)}` };
  }
}

async function readInputRecordAt(path: string, deps: VerifyCliDeps): Promise<Result<RecordedInput | undefined>> {
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  let content: string;
  try {
    content = await fs.readFile(path, STATE_STORE_TEXT_ENCODING);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: ${toMessage(error)}` };
  }
  const parsed = parseRecordedInput(content);
  if (!parsed.ok) return parsed;
  return { ok: true, value: parsed.value };
}

function verifyRunLocatorDiagnostic(summary: string, context: VerifyRunNotFoundContext): string {
  return [
    summary,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${context.runToken}`,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.VERIFICATION_TYPE}${context.verificationType}`,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE_TYPE}${context.scopeType}`,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.SCOPE}${context.scopeIdentity}`,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.BACKEND}${context.backendIdentity}`,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.NAMESPACE}${context.storageNamespace}`,
    `${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.TARGET}${context.searchedTarget}`,
  ].join(" ");
}

function verifyRunNotFoundDiagnostic(context: VerifyRunNotFoundContext): string {
  return verifyRunLocatorDiagnostic(VERIFY_CLI_ERROR.RUN_NOT_FOUND, context);
}

/**
 * Start a changeset-scoped verification run: derive the changed-file scope, create a canonical
 * verification context, open a run journal, record the verification input read from `--input`, and
 * report the run token, context digest, changed scope, input descriptor, and run locator a caller
 * persists to address the run.
 */
export async function verifyStartCommand(
  options: VerifyStartCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  if (!isVerifyVerificationType(options.verificationType)) {
    return errorResult(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  }
  if (options.scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) return errorResult(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
  if (options.input.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.INPUT_REQUIRED);
  const scope = parseChangesetScope(options.scope);
  if (!scope.ok) return errorResult(scope.error);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);

  const inputContent = await deps.readInputSource(options.input);
  const inputDigest = digestRunInput(options.input, inputContent);
  if (!inputDigest.ok) return errorResult(inputDigest.error);

  const changedScope = await resolveChangedScope(scope.value, deps);
  if (!changedScope.ok) return errorResult(changedScope.error);

  const context = await verificationContextCreateCommand(
    {
      subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
      base: scope.value.base,
      head: scope.value.head,
      predicate: options.verificationType,
      workflow: options.verificationType,
    },
    forwardDeps(deps),
  );
  if (context.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return errorResult(context.output);
  const contextDigest = (JSON.parse(context.output) as { readonly digest: string }).digest;

  const opened = await journalOpenCommand(
    { type: options.verificationType, branchSlug: resolved.value.branchSlug },
    forwardDeps(deps),
  );
  if (opened.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return errorResult(opened.output);
  const { runToken, runFile } = JSON.parse(opened.output) as { readonly runToken: string; readonly runFile: string };

  const runScope: VerifyRunScope = {
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    type: options.verificationType,
    runToken,
  };
  const recorded: RecordedInput = {
    scopeIdentity: options.scope,
    scopeType: options.scopeType,
    source: options.input,
    digest: inputDigest.value,
    content: inputContent,
  };
  const persisted = await persistInputRecord(runScope, recorded, deps);
  if (!persisted.ok) return errorResult(persisted.error);

  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return errorResult(namespace.error);

  const locator = buildRunLocator({
    runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity: resolved.value.backendIdentity,
    storageNamespace: namespace.value,
    runTarget: runFile,
  });
  const report: VerifyStartReport = {
    runToken,
    contextDigest,
    changedScope: changedScope.value,
    input: { source: options.input, digest: inputDigest.value },
    locator,
  };
  return okResult(JSON.stringify(report));
}

/**
 * Replay the verification input recorded at start for the run named by `--run`, reporting the
 * exact input content and the digest recorded at start rather than reading a fresh input. A
 * type/scope-only selection without a run token, or a run the store does not hold, is rejected.
 */
export async function verifyInputCommand(
  options: VerifyInputCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  const run = await resolveExistingRun(options, deps);
  if (!run.ok) return errorResult(run.error);
  const record = run.value.recordedInput;
  const report: VerifyInputReport = {
    source: record.source,
    digest: record.digest,
    content: record.content,
  };
  return okResult(JSON.stringify(report));
}

type VerifyAppendVerb = typeof VERIFY_VERB.APPEND_SCOPE | typeof VERIFY_VERB.APPEND_FINDING;

/** Read a run's full event history through the journal substrate, or report the read failure. */
async function readRunJournalEvents(
  scope: JournalRunCliScope,
  deps: VerifyCliDeps,
): Promise<Result<readonly JournalEvent[]>> {
  const read = await journalReadCommand(scope, String(JOURNAL_SEQ_BASE), forwardDeps(deps));
  if (read.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return { ok: false, error: read.output };
  return { ok: true, value: JSON.parse(read.output) as readonly JournalEvent[] };
}

/** The prepared context for an append: injected capabilities, the run's journal scope, and namespace. */
interface PreparedAppend {
  readonly readPayload: (source: string) => Promise<string>;
  readonly binding: JournalStreamBinding;
  readonly journalScope: JournalRunCliScope;
  readonly namespace: string;
  readonly backendIdentity: string;
}

/**
 * Validate the append request's required selectors and injected capabilities, then resolve the
 * run's journal scope and storage namespace, so `verifyAppend` orchestrates a prepared run.
 */
async function prepareAppend(options: VerifyAppendCliOptions, deps: VerifyCliDeps): Promise<Result<PreparedAppend>> {
  if (options.run.trim().length === 0) return { ok: false, error: VERIFY_CLI_ERROR.RUN_REQUIRED };
  if (options.payload.trim().length === 0) return { ok: false, error: VERIFY_CLI_ERROR.PAYLOAD_REQUIRED };
  if (options.idempotencyKey.trim().length === 0) {
    return { ok: false, error: VERIFY_CLI_ERROR.IDEMPOTENCY_KEY_REQUIRED };
  }

  const readPayload = deps.readPayloadSource;
  const binding = deps.journalBinding;
  if (readPayload === undefined || binding === undefined) return { ok: false, error: VERIFY_CLI_ERROR.APPEND_FAILED };

  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return resolved;

  const runScope: VerifyRunScope = {
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    type: options.verificationType,
    runToken: options.run,
  };
  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return namespace;

  // A started verify run persists a recorded input at `start`; its absence means the token names a
  // raw journal run rather than a started verification run, so reject the append the way `input` does.
  const inputPath = verifyInputRecordPath(runScope);
  if (!inputPath.ok) return inputPath;
  const inputRecord = await readInputRecordAt(inputPath.value, deps);
  if (!inputRecord.ok) return inputRecord;
  if (inputRecord.value === undefined) {
    return {
      ok: false,
      error: appendRunNotFoundDiagnostic(options, resolved.value.backendIdentity, namespace.value, inputPath.value),
    };
  }
  if (!recordedSelectorMatches(inputRecord.value, options)) {
    return {
      ok: false,
      error: appendRunSelectorMismatchDiagnostic(
        options,
        resolved.value.backendIdentity,
        namespace.value,
        inputPath.value,
      ),
    };
  }

  return {
    ok: true,
    value: {
      readPayload,
      binding,
      journalScope: { type: options.verificationType, runToken: options.run, branchSlug: resolved.value.branchSlug },
      namespace: namespace.value,
      backendIdentity: resolved.value.backendIdentity,
    },
  };
}

/** Report the run-not-found diagnostic for an append whose run the journal store does not hold. */
function appendRunNotFoundDiagnostic(
  options: VerifyAppendCliOptions,
  backendIdentity: string,
  namespace: string,
  searchedTarget: string = namespace,
): string {
  return verifyRunNotFoundDiagnostic({
    runToken: options.run,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity,
    storageNamespace: namespace,
    searchedTarget,
  });
}

/** Report the selector-mismatch diagnostic for an append whose recorded run selector differs. */
function appendRunSelectorMismatchDiagnostic(
  options: VerifyAppendCliOptions,
  backendIdentity: string,
  namespace: string,
  searchedTarget: string,
): string {
  return verifyRunLocatorDiagnostic(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH, {
    runToken: options.run,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity,
    storageNamespace: namespace,
    searchedTarget,
  });
}

/** Validate a finding payload against its verification type, returning the CLI error when invalid. */
function validateAppendFinding(
  verb: VerifyAppendVerb,
  verificationType: string,
  payload: JsonValue,
): string | undefined {
  if (verb !== VERIFY_VERB.APPEND_FINDING) return undefined;
  const validator = findingValidatorFor(verificationType);
  if (validator === undefined) return VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE;
  if (validator(payload) === undefined) return VERIFY_CLI_ERROR.FINDING_INVALID;
  return undefined;
}

/** The CloudEvents type an evidence-add command records: a finding or inspected scope. */
function appendEventType(verb: VerifyAppendVerb): VerifyAppendEventType {
  return verb === VERIFY_VERB.APPEND_FINDING ? VERIFY_APPEND_EVENT_TYPE.FINDING : VERIFY_APPEND_EVENT_TYPE.SCOPE;
}

/**
 * Append inspected scope or a validated finding to a started run exactly once per idempotency key.
 * The append requires an explicit `--payload` and `--idempotency-key`, validates a finding payload
 * against the run's verification type, and returns the existing journal sequence for a repeated key
 * rather than duplicating evidence. It never reads the recorded run input as the append payload.
 */
async function verifyAppend(
  options: VerifyAppendCliOptions,
  deps: VerifyCliDeps,
  verb: VerifyAppendVerb,
): Promise<CliCommandResult> {
  const prepared = await prepareAppend(options, deps);
  if (!prepared.ok) return errorResult(prepared.error);
  const { readPayload, binding, journalScope, namespace, backendIdentity } = prepared.value;
  const eventType = appendEventType(verb);

  const before = await readRunJournalEvents(journalScope, deps);
  if (!before.ok) {
    // A missing run reports the addressable run locator; any other read failure (a backend,
    // scope, or storage error) surfaces its real reason rather than masquerading as run-not-found.
    if (before.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return errorResult(appendRunNotFoundDiagnostic(options, backendIdentity, namespace));
    }
    return errorResult(`${VERIFY_CLI_ERROR.APPEND_FAILED}: ${before.error}`);
  }

  // A run carrying a terminal-completion event is finished; it rejects further evidence whether or
  // not its journal seal marker was written, so a projected sealed run never accepts a later append.
  if (findTerminalEvent(before.value) !== undefined) return errorResult(VERIFY_CLI_ERROR.RUN_FINISHED);

  const existing = findAppendedSequence(before.value, options.idempotencyKey, eventType);
  if (existing !== undefined) {
    const report: VerifyAppendReport = { sequence: existing, idempotent: true };
    return okResult(JSON.stringify(report));
  }

  let rawPayload: string;
  try {
    rawPayload = await readPayload(options.payload);
  } catch (error) {
    return errorResult(`${VERIFY_CLI_ERROR.PAYLOAD_READ_FAILED}: ${toMessage(error)}`);
  }
  const parsed = parseAppendPayload(rawPayload);
  if (parsed === undefined) return errorResult(VERIFY_CLI_ERROR.PAYLOAD_INVALID);
  const findingError = validateAppendFinding(verb, options.verificationType, parsed);
  if (findingError !== undefined) return errorResult(findingError);

  const event = buildAppendEvent({
    eventType,
    idempotencyKey: options.idempotencyKey,
    payload: parsed,
    at: deps.now?.() ?? new Date(),
  });
  const appended = await journalAppendCommand(journalScope, event, binding, forwardDeps(deps));
  if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return errorResult(`${VERIFY_CLI_ERROR.APPEND_FAILED}: ${appended.output}`);
  }

  const after = await readRunJournalEvents(journalScope, deps);
  if (!after.ok) return errorResult(`${VERIFY_CLI_ERROR.APPEND_FAILED}: ${after.error}`);
  const sequence = findAppendedSequence(after.value, options.idempotencyKey, eventType);
  if (sequence === undefined) return errorResult(VERIFY_CLI_ERROR.APPEND_FAILED);
  const report: VerifyAppendReport = { sequence, idempotent: false };
  return okResult(JSON.stringify(report));
}

/** Record the inspected scope for a started run under a caller idempotency key. */
export async function verifyAppendScopeCommand(
  options: VerifyAppendCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  return verifyAppend(options, deps, VERIFY_VERB.APPEND_SCOPE);
}

/** Record a validated verification finding for a started run under a caller idempotency key. */
export async function verifyAppendFindingCommand(
  options: VerifyAppendCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  return verifyAppend(options, deps, VERIFY_VERB.APPEND_FINDING);
}

/** An existing run's resolved journal scope and storage namespace, addressing one started run. */
interface VerifyExistingRun {
  readonly productDir: string;
  readonly runToken: string;
  readonly journalScope: JournalRunCliScope & { readonly branchSlug: string };
  readonly namespace: string;
  readonly backendIdentity: string;
  readonly inputRecordPath: string;
  readonly recordedInput: RecordedInput;
}

type VerifyExistingRunAddress = Omit<VerifyExistingRun, "recordedInput">;

interface VerifyExistingRunSelector {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
}

/** Report the run-not-found diagnostic for an existing-run verb whose run the store does not hold. */
function existingRunNotFound(run: VerifyExistingRunAddress, options: VerifyExistingRunSelector): string {
  return verifyRunNotFoundDiagnostic({
    runToken: run.runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity: run.backendIdentity,
    storageNamespace: run.namespace,
    searchedTarget: run.inputRecordPath,
  });
}

/** Report the selector-mismatch diagnostic for an existing run whose recorded selector differs. */
function existingRunSelectorMismatch(run: VerifyExistingRunAddress, options: VerifyExistingRunSelector): string {
  return verifyRunLocatorDiagnostic(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH, {
    runToken: run.runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity: run.backendIdentity,
    storageNamespace: run.namespace,
    searchedTarget: run.inputRecordPath,
  });
}

function recordedSelectorMatches(record: RecordedInput, options: VerifyExistingRunSelector): boolean {
  return record.scopeType === options.scopeType && record.scopeIdentity === options.scope;
}

async function readExistingRecordedInput(
  run: VerifyExistingRunAddress,
  deps: VerifyCliDeps,
): Promise<Result<RecordedInput | undefined>> {
  return readInputRecordAt(run.inputRecordPath, deps);
}

/** Resolve an existing run's journal scope and storage namespace from explicit selectors. */
async function resolveExistingRunAddress(
  options: VerifyExistingRunSelector,
  deps: VerifyCliDeps,
): Promise<Result<VerifyExistingRunAddress>> {
  if (options.scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) {
    return { ok: false, error: VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE };
  }
  const scope = parseChangesetScope(options.scope);
  if (!scope.ok) return scope;
  if (options.run.trim().length === 0) return { ok: false, error: VERIFY_CLI_ERROR.RUN_REQUIRED };
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return resolved;
  const runScope: VerifyRunScope = {
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    type: options.verificationType,
    runToken: options.run,
  };
  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return namespace;
  const inputPath = verifyInputRecordPath(runScope);
  if (!inputPath.ok) return inputPath;
  return {
    ok: true,
    value: {
      productDir: resolved.value.productDir,
      runToken: options.run,
      journalScope: { type: options.verificationType, runToken: options.run, branchSlug: resolved.value.branchSlug },
      namespace: namespace.value,
      backendIdentity: resolved.value.backendIdentity,
      inputRecordPath: inputPath.value,
    },
  };
}

/**
 * Resolve an existing run's journal scope and storage namespace, confirming it was started (its
 * recorded input is present). A blank run token, or a token the store does not hold, is rejected
 * with the addressable run-not-found diagnostic — the identity `input` and the append verbs report.
 */
async function resolveExistingRun(
  options: VerifyExistingRunSelector,
  deps: VerifyCliDeps,
): Promise<Result<VerifyExistingRun>> {
  const address = await resolveExistingRunAddress(options, deps);
  if (!address.ok) return address;
  const inputRecord = await readExistingRecordedInput(address.value, deps);
  if (!inputRecord.ok) return inputRecord;
  if (inputRecord.value === undefined) {
    return { ok: false, error: existingRunNotFound(address.value, options) };
  }
  if (!recordedSelectorMatches(inputRecord.value, options)) {
    return { ok: false, error: existingRunSelectorMismatch(address.value, options) };
  }
  const run: VerifyExistingRun = { ...address.value, recordedInput: inputRecord.value };
  return { ok: true, value: run };
}

async function ensureRecordedSelectorMatchesWhenPresent(
  run: VerifyExistingRunAddress,
  options: VerifyExistingRunSelector,
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const inputRecord = await readExistingRecordedInput(run, deps);
  if (!inputRecord.ok) return inputRecord;
  if (inputRecord.value === undefined) return { ok: true, value: undefined };
  if (!recordedSelectorMatches(inputRecord.value, options)) {
    return { ok: false, error: existingRunSelectorMismatch(run, options) };
  }
  return { ok: true, value: undefined };
}

/** Assemble the terminal projection report a `finish` returns from a run's folded event history. */
function verifyFinishReport(runToken: string, projection: VerifyRunProjection): VerifyFinishReport {
  return {
    runToken,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    sealed: projection.sealed,
    findingCount: projection.findingCount,
    lastSequence: projection.lastSequence,
  };
}

async function isJournalPhysicallySealed(run: VerifyExistingRunAddress, deps: VerifyCliDeps): Promise<Result<boolean>> {
  const runs = await listJournalRuns(
    {
      productDir: run.productDir,
      branchSlug: run.journalScope.branchSlug,
      type: run.journalScope.type,
      limit: VERIFY_RUN_LOOKUP_LIMIT,
    },
    { ...(deps.fs === undefined ? {} : { fs: deps.fs }) },
  );
  if (!runs.ok) return runs;
  const metadata = runs.value.find((entry) => entry.runToken === run.runToken);
  return { ok: true, value: metadata?.sealed ?? false };
}

async function sealExistingRun(
  run: VerifyExistingRunAddress,
  deps: VerifyCliDeps,
): Promise<CliCommandResult | undefined> {
  const sealed = await journalSealCommand(run.journalScope, forwardDeps(deps));
  if (sealed.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return errorResult(`${VERIFY_CLI_ERROR.SEAL_FAILED}: ${sealed.output}`);
  }
  return undefined;
}

function finishReadFailure(
  run: VerifyExistingRunAddress,
  options: VerifyExistingRunSelector,
  error: string,
): CliCommandResult {
  if (error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
    return errorResult(existingRunNotFound(run, options));
  }
  return errorResult(`${VERIFY_CLI_ERROR.FINISH_FAILED}: ${error}`);
}

async function finishProjectionResult(run: VerifyExistingRunAddress, deps: VerifyCliDeps): Promise<CliCommandResult> {
  const events = await readRunJournalEvents(run.journalScope, deps);
  if (!events.ok) return errorResult(`${VERIFY_CLI_ERROR.FINISH_FAILED}: ${events.error}`);
  return okResult(JSON.stringify(verifyFinishReport(run.runToken, projectVerifyRun(events.value))));
}

async function retrySealForTerminalRun(
  run: VerifyExistingRunAddress,
  deps: VerifyCliDeps,
): Promise<CliCommandResult | undefined> {
  const physicallySealed = await isJournalPhysicallySealed(run, deps);
  if (!physicallySealed.ok) return errorResult(`${VERIFY_CLI_ERROR.FINISH_FAILED}: ${physicallySealed.error}`);
  if (physicallySealed.value) return undefined;
  return sealExistingRun(run, deps);
}

/**
 * Record terminal completion for a started run, seal its journal, and report the terminal
 * projection folded from the event history. `finish` validates the terminal status against the
 * journal terminal-status vocabulary before recording, and is idempotent on the presence of its
 * terminal-completion event: a repeated finish returns the existing projection rather than
 * appending a second terminal event.
 */
export async function verifyFinishCommand(
  options: VerifyFinishCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  if (options.terminalStatus.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.TERMINAL_STATUS_REQUIRED);
  if (!isVerifyTerminalStatus(options.terminalStatus)) return errorResult(VERIFY_CLI_ERROR.TERMINAL_STATUS_INVALID);
  const run = await resolveExistingRunAddress(options, deps);
  if (!run.ok) return errorResult(run.error);
  const selector = await ensureRecordedSelectorMatchesWhenPresent(run.value, options, deps);
  if (!selector.ok) return errorResult(selector.error);

  const before = await readRunJournalEvents(run.value.journalScope, deps);
  if (!before.ok) {
    return finishReadFailure(run.value, options, before.error);
  }
  // A run already carrying its terminal event is finished; retry the physical seal when an earlier
  // finish recorded terminal completion but failed to persist the seal marker.
  if (findTerminalEvent(before.value) !== undefined) {
    const retrySeal = await retrySealForTerminalRun(run.value, deps);
    return retrySeal ?? finishProjectionResult(run.value, deps);
  }

  // Only the append-and-seal path consumes the journal binding.
  const binding = deps.journalBinding;
  if (binding === undefined) return errorResult(VERIFY_CLI_ERROR.FINISH_FAILED);

  const event = buildTerminalEvent({
    runToken: run.value.runToken,
    terminalStatus: options.terminalStatus,
    at: deps.now?.() ?? new Date(),
  });
  const appended = await journalAppendCommand(run.value.journalScope, event, binding, forwardDeps(deps));
  if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return errorResult(`${VERIFY_CLI_ERROR.FINISH_FAILED}: ${appended.output}`);
  }
  const sealResult = await sealExistingRun(run.value, deps);
  if (sealResult !== undefined) return sealResult;

  return finishProjectionResult(run.value, deps);
}

/** Report a started run's resumable status projected from its journal event history. */
export async function verifyStatusCommand(
  options: VerifyStatusCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  const run = await resolveExistingRunAddress(options, deps);
  if (!run.ok) return errorResult(run.error);
  const selector = await ensureRecordedSelectorMatchesWhenPresent(run.value, options, deps);
  if (!selector.ok) return errorResult(selector.error);
  const events = await readRunJournalEvents(run.value.journalScope, deps);
  if (!events.ok) {
    if (events.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return errorResult(existingRunNotFound(run.value, options));
    }
    return errorResult(`${VERIFY_CLI_ERROR.STATUS_FAILED}: ${events.error}`);
  }
  const projection = projectVerifyRun(events.value);
  const report: VerifyStatusReport = {
    runToken: run.value.runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    sealed: projection.sealed,
    lastSequence: projection.lastSequence,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    findingCount: projection.findingCount,
    nextActions: projection.nextActions,
  };
  return okResult(JSON.stringify(report));
}

/** Render a started run's journal projection, including the authoritative finding count, without appending. */
export async function verifyRenderCommand(
  options: VerifyRenderCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  const run = await resolveExistingRunAddress(options, deps);
  if (!run.ok) return errorResult(run.error);
  const selector = await ensureRecordedSelectorMatchesWhenPresent(run.value, options, deps);
  if (!selector.ok) return errorResult(selector.error);
  const events = await readRunJournalEvents(run.value.journalScope, deps);
  if (!events.ok) {
    if (events.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return errorResult(existingRunNotFound(run.value, options));
    }
    return errorResult(`${VERIFY_CLI_ERROR.RENDER_FAILED}: ${events.error}`);
  }
  const projection = projectVerifyRun(events.value);
  const report: VerifyRenderReport = {
    runToken: run.value.runToken,
    findingCount: projection.findingCount,
    sealed: projection.sealed,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    events: events.value,
  };
  return okResult(JSON.stringify(report));
}
