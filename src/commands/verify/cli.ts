import { dirname } from "node:path";

import {
  journalAppendCommand,
  journalOpenCommand,
  journalReadCommand,
  type JournalRunCliScope,
  type JournalStreamBinding,
  readJournalCliEnvironment,
} from "@/commands/journal/cli";
import { JOURNAL_RUNTIME_ERROR } from "@/commands/journal/runtime";
import { verificationContextCreateCommand } from "@/commands/verification-context/cli";
import type { CliCommandResult, Result } from "@/config/types";
import { CONFIG_PROCESS_CWD } from "@/domains/config/cwd";
import { type JournalEdgeBackend, resolveJournalBackend } from "@/domains/journal/backend-selection";
import { VERIFICATION_CONTEXT_SUBJECT_KIND } from "@/domains/verification-context/context";
import {
  buildAppendEvent,
  buildRunLocator,
  type ChangesetScope,
  digestRunInput,
  findAppendedSequence,
  findingValidatorFor,
  type InputDescriptor,
  parseAppendPayload,
  parseChangesetScope,
  type RecordedInput,
  type RunLocator,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERB,
  type VerifyAppendEventType,
  verifyInputRecordPath,
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

export const VERIFY_CLI_ERROR = {
  INPUT_REQUIRED: "spx verify start requires --input <input-source>",
  RUN_REQUIRED: "spx verify existing-run verbs require an explicit --run <run-token>",
  RUN_NOT_FOUND: "spx verify could not locate the requested run",
  CHANGED_SCOPE_FAILED: "spx verify could not derive the changeset changed-file scope",
  INPUT_PERSIST_FAILED: "spx verify could not persist the recorded run input",
  INPUT_READ_FAILED: "spx verify could not read the recorded run input",
  PAYLOAD_REQUIRED: "spx verify append verbs require --payload <payload-source>",
  IDEMPOTENCY_KEY_REQUIRED: "spx verify append verbs require --idempotency-key <key>",
  PAYLOAD_READ_FAILED: "spx verify could not read the append payload",
  PAYLOAD_INVALID: "spx verify append payload is not valid JSON",
  FINDING_INVALID: "spx verify append-finding payload failed verification-type validation",
  UNSUPPORTED_VERIFICATION_TYPE: "spx verify append-finding has no finding validator for the verification type",
  APPEND_FAILED: "spx verify could not append the evidence event",
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
    await fs.writeFile(path.value, JSON.stringify(record));
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED}: ${toMessage(error)}` };
  }
}

async function readInputRecordAt(path: string, deps: VerifyCliDeps): Promise<Result<RecordedInput | undefined>> {
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  try {
    const content = await fs.readFile(path, STATE_STORE_TEXT_ENCODING);
    return { ok: true, value: JSON.parse(content) as RecordedInput };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: ${toMessage(error)}` };
  }
}

function verifyRunNotFoundDiagnostic(context: VerifyRunNotFoundContext): string {
  return [
    VERIFY_CLI_ERROR.RUN_NOT_FOUND,
    `run=${context.runToken}`,
    `verification-type=${context.verificationType}`,
    `scope-type=${context.scopeType}`,
    `scope=${context.scopeIdentity}`,
    `backend=${context.backendIdentity}`,
    `namespace=${context.storageNamespace}`,
    `target=${context.searchedTarget}`,
  ].join(" ");
}

/**
 * Start a changeset-scoped verification run: create a canonical verification context, open a
 * run journal, record the verification input read from `--input`, derive the changed-file
 * scope, and report the run token, context digest, changed scope, input descriptor, and run
 * locator a caller persists to address the run.
 */
export async function verifyStartCommand(
  options: VerifyStartCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  if (options.scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) return errorResult(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
  if (options.input.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.INPUT_REQUIRED);
  const scope = parseChangesetScope(options.scope);
  if (!scope.ok) return errorResult(scope.error);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);

  const inputContent = await deps.readInputSource(options.input);
  const inputDigest = digestRunInput(options.input, inputContent);
  if (!inputDigest.ok) return errorResult(inputDigest.error);

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
  const recorded: RecordedInput = { source: options.input, digest: inputDigest.value, content: inputContent };
  const persisted = await persistInputRecord(runScope, recorded, deps);
  if (!persisted.ok) return errorResult(persisted.error);

  const changedScope = await resolveChangedScope(scope.value, deps);
  if (!changedScope.ok) return errorResult(changedScope.error);

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
  if (options.run.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.RUN_REQUIRED);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);

  const runScope: VerifyRunScope = {
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    type: options.verificationType,
    runToken: options.run,
  };
  const path = verifyInputRecordPath(runScope);
  if (!path.ok) return errorResult(path.error);
  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return errorResult(namespace.error);

  const record = await readInputRecordAt(path.value, deps);
  if (!record.ok) return errorResult(record.error);
  if (record.value === undefined) {
    return errorResult(
      verifyRunNotFoundDiagnostic({
        runToken: options.run,
        verificationType: options.verificationType,
        scopeType: options.scopeType,
        scopeIdentity: options.scope,
        backendIdentity: resolved.value.backendIdentity,
        storageNamespace: namespace.value,
        searchedTarget: path.value,
      }),
    );
  }
  const report: VerifyInputReport = {
    source: record.value.source,
    digest: record.value.digest,
    content: record.value.content,
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

/**
 * Append inspected scope or a validated finding to a started run exactly once per idempotency key.
 * The append requires an explicit `--payload` and `--idempotency-key`, validates a finding payload
 * against the run's verification type, and returns the existing journal sequence for a repeated key
 * rather than duplicating evidence. It never reads the recorded run input as the append payload.
 */
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
): string {
  return verifyRunNotFoundDiagnostic({
    runToken: options.run,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity,
    storageNamespace: namespace,
    searchedTarget: namespace,
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

/** The CloudEvents type an append verb records: a finding for `append-finding`, otherwise inspected scope. */
function appendEventType(verb: VerifyAppendVerb): VerifyAppendEventType {
  return verb === VERIFY_VERB.APPEND_FINDING ? VERIFY_APPEND_EVENT_TYPE.FINDING : VERIFY_APPEND_EVENT_TYPE.SCOPE;
}

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

  const existing = findAppendedSequence(before.value, options.idempotencyKey, eventType);
  if (existing !== undefined) {
    const report: VerifyAppendReport = { sequence: existing, idempotent: true };
    return okResult(JSON.stringify(report));
  }

  const parsed = parseAppendPayload(await readPayload(options.payload));
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
