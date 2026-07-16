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
import { isJournalRunSealed, JOURNAL_RUNTIME_ERROR } from "@/commands/journal/runtime";
import { verificationContextCreateCommand } from "@/commands/verification-context/cli";
import type { CliCommandResult, Result } from "@/config/types";
import { type JournalEdgeBackend, resolveJournalBackend } from "@/domains/journal/backend-selection";
import {
  normalizeVerificationContextFileSubjectPath,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
} from "@/domains/verification-context/context";
import {
  buildAppendEvent,
  buildRunContextEvent,
  buildRunLocator,
  buildTerminalEvent,
  type ChangesetScope,
  digestRunInput,
  driveModeOf,
  evidenceValidatorFor,
  findAppendedSequence,
  findTerminalEvent,
  type InputDescriptor,
  isVerifyTerminalStatus,
  isVerifyVerificationType,
  parseAppendPayload,
  parseChangesetScope,
  projectVerifyRun,
  type RecordedInput,
  type RunLocator,
  TERMINAL_METADATA_VALIDATION_ERROR,
  terminalMetadataValidatorFor,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_EVIDENCE_KIND,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERB,
  type VerifyAppendEventType,
  type VerifyDriveMode,
  verifyInputRecordPath,
  type VerifyRunProjection,
  type VerifyRunScope,
  verifyRunsDir,
  type VerifyRunSelector,
  type VerifyScopeType,
} from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import { writeFileAtomic } from "@/lib/atomic-file-write";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { changedPathsForCommittedRange } from "@/lib/git/changed-paths";
import {
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getCurrentBranch,
  getHeadSha,
  type GitDependencies,
} from "@/lib/git/root";
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
  SCOPE_INVALID: "spx verification run scope add payload failed verification-type validation",
  FINDING_INVALID: "spx verification run finding add payload failed verification-type validation",
  UNSUPPORTED_VERIFICATION_TYPE: "spx verification run verification type is not registered",
  SPX_DRIVEN_APPEND_REJECTED: "spx verification run cannot add caller evidence to a run spx drives",
  APPEND_FAILED: "spx verification run could not append the evidence event",
  TERMINAL_STATUS_REQUIRED: "spx verification run finish requires --terminal-status <status>",
  TERMINAL_STATUS_INVALID:
    "spx verification run finish requires a terminal status in the journal terminal-status vocabulary",
  TERMINAL_METADATA_INVALID: "spx verification run terminal metadata failed verification-type validation",
  TERMINAL_STATUS_CONFLICT:
    "spx verification run terminal status conflicts with verification-type terminal metadata: status-conflict",
  FINISH_FAILED: "spx verification run could not record terminal completion",
  RUN_CONTEXT_FAILED: "spx verification run could not record the run drive mode",
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

const VERIFY_START_ROLLBACK_ARTIFACT = {
  CONTEXT_FILE: "verification context file",
  RUN_FILE: "journal run file",
  INPUT_RECORD: "recorded input file",
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
  /** The journal streaming binding the descriptor injects; the append verbs and start stream through it. */
  readonly journalBinding?: JournalStreamBinding;
  /** The run's drive mode recorded at start; the caller path defaults to caller-driven, spx execution supplies spx-driven. */
  readonly driveMode?: VerifyDriveMode;
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
  readonly resolvedScope: readonly string[];
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
  readonly terminalMetadata?: string;
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
  readonly terminalMetadata?: JsonValue;
  readonly sealed: boolean;
  readonly findingCount: number;
  readonly lastSequence: number;
}

export interface VerifyStatusReport {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly sealed: boolean;
  readonly driveMode: string;
  readonly lastSequence: number;
  readonly terminalStatus?: string;
  readonly terminalMetadata?: JsonValue;
  readonly findingCount: number;
  readonly nextActions: readonly string[];
}

export interface VerifyRenderReport {
  readonly runToken: string;
  readonly findingCount: number;
  readonly sealed: boolean;
  readonly driveMode: string;
  readonly terminalStatus?: string;
  readonly terminalMetadata?: JsonValue;
  readonly nextActions: readonly string[];
  readonly events: readonly JournalEvent[];
}

interface VerifyResolvedScope {
  readonly productDir: string;
  readonly worktreeRoot: string;
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
      worktreeRoot: product.worktreeRoot,
      branchSlug: slugBranchIdentity(branchIdentity),
      backendIdentity: backend.value,
    },
  };
}

/** Derive the changeset's changed product paths from a null-delimited name-status diff. */
async function resolveChangedScope(
  scope: ChangesetScope,
  productDir: string,
  deps: VerifyCliDeps,
): Promise<Result<readonly string[]>> {
  const git = deps.git ?? defaultGitDependencies;
  try {
    return {
      ok: true,
      value: await changedPathsForCommittedRange({
        productDir,
        base: scope.base,
        head: scope.head,
        git,
      }),
    };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.CHANGED_SCOPE_FAILED}: ${(error as Error).message}` };
  }
}

interface VerifyStartContextSubjectOptions {
  readonly subject: string;
  readonly path?: string;
  readonly base?: string;
  readonly head?: string;
}

interface VerifyStartScopeResolution {
  readonly selector: VerifyRunSelector;
  readonly context: VerifyStartContextSubjectOptions;
  readonly resolvedScope: readonly string[];
}

type VerifyStartScopeResolver = (
  selector: VerifyRunSelector,
  worktreeRoot: string,
  deps: VerifyCliDeps,
) => Promise<Result<VerifyStartScopeResolution>>;

function normalizeVerifyRunSelector(scopeType: string, scopeIdentity: string): Result<VerifyRunSelector> {
  if (scopeType === VERIFY_SCOPE_TYPE.CHANGESET) {
    const parsed = parseChangesetScope(scopeIdentity);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      value: {
        scopeType,
        scopeIdentity: `${parsed.value.base}${VERIFY_SCOPE_SEPARATOR}${parsed.value.head}`,
      },
    };
  }
  if (scopeType === VERIFY_SCOPE_TYPE.FILE) {
    const normalized = normalizeVerificationContextFileSubjectPath(scopeIdentity);
    return normalized === undefined
      ? { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_FILE }
      : { ok: true, value: { scopeType, scopeIdentity: normalized } };
  }
  return { ok: false, error: VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE };
}

const VERIFY_START_SCOPE_RESOLVERS: Readonly<
  Record<VerifyScopeType, VerifyStartScopeResolver | undefined>
> = {
  [VERIFY_SCOPE_TYPE.CHANGESET]: async (selector, worktreeRoot, deps) => {
    const changeset = parseChangesetScope(selector.scopeIdentity);
    if (!changeset.ok) return changeset;
    const resolvedScope = await resolveChangedScope(changeset.value, worktreeRoot, deps);
    if (!resolvedScope.ok) return resolvedScope;
    return {
      ok: true,
      value: {
        selector,
        context: {
          subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
          base: changeset.value.base,
          head: changeset.value.head,
        },
        resolvedScope: resolvedScope.value,
      },
    };
  },
  [VERIFY_SCOPE_TYPE.FILE]: async (selector) => ({
    ok: true,
    value: {
      selector,
      context: {
        subject: VERIFICATION_CONTEXT_SUBJECT_KIND.FILE,
        path: selector.scopeIdentity,
      },
      resolvedScope: [selector.scopeIdentity],
    },
  }),
  [VERIFY_SCOPE_TYPE.WORKING_TREE]: undefined,
};

async function resolveVerifyStartScope(
  scopeType: string,
  scopeIdentity: string,
  worktreeRoot: string,
  deps: VerifyCliDeps,
): Promise<Result<VerifyStartScopeResolution>> {
  const selector = normalizeVerifyRunSelector(scopeType, scopeIdentity);
  if (!selector.ok) return selector;
  const resolver = VERIFY_START_SCOPE_RESOLVERS[selector.value.scopeType];
  return resolver === undefined
    ? { ok: false, error: VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE }
    : resolver(selector.value, worktreeRoot, deps);
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

async function readStartInputContent(
  source: string,
  deps: VerifyCliDeps,
): Promise<Result<string>> {
  try {
    return { ok: true, value: await deps.readInputSource(source) };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: ${toMessage(error)}` };
  }
}

async function removeStartedRunArtifact(
  path: string,
  label: (typeof VERIFY_START_ROLLBACK_ARTIFACT)[keyof typeof VERIFY_START_ROLLBACK_ARTIFACT],
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  try {
    await fs.rm(path, { force: true });
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: `${VERIFY_CLI_ERROR.INPUT_PERSIST_FAILED}: rollback failed for ${label}: ${toMessage(error)}`,
    };
  }
}

async function removeStartedRunArtifacts(
  artifacts: { readonly contextPath?: string; readonly runFile?: string; readonly inputRecordPath?: string },
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const rollbackErrors: string[] = [];
  if (artifacts.contextPath !== undefined) {
    const contextRollback = await removeStartedRunArtifact(
      artifacts.contextPath,
      VERIFY_START_ROLLBACK_ARTIFACT.CONTEXT_FILE,
      deps,
    );
    if (!contextRollback.ok) rollbackErrors.push(contextRollback.error);
  }
  if (artifacts.runFile !== undefined) {
    const runRollback = await removeStartedRunArtifact(
      artifacts.runFile,
      VERIFY_START_ROLLBACK_ARTIFACT.RUN_FILE,
      deps,
    );
    if (!runRollback.ok) rollbackErrors.push(runRollback.error);
  }
  if (artifacts.inputRecordPath !== undefined) {
    const inputRollback = await removeStartedRunArtifact(
      artifacts.inputRecordPath,
      VERIFY_START_ROLLBACK_ARTIFACT.INPUT_RECORD,
      deps,
    );
    if (!inputRollback.ok) rollbackErrors.push(inputRollback.error);
  }
  if (rollbackErrors.length > 0) return { ok: false, error: rollbackErrors.join("; ") };
  return { ok: true, value: undefined };
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

interface CompleteVerifyStartArgs {
  readonly options: VerifyStartCliOptions;
  readonly deps: VerifyCliDeps;
  readonly productDir: string;
  readonly branchSlug: string;
  readonly backendIdentity: string;
  readonly resolvedScope: readonly string[];
  readonly inputDigest: string;
  readonly inputContent: string;
  readonly contextDigest: string;
  readonly contextPath: string;
  readonly contextCreated: boolean;
}

/**
 * Record the run's drive mode on a verify-owned run-context event so status and render fold it to
 * filter next actions. The caller path defaults to caller-driven; spx execution supplies spx-driven.
 * The append streams through the same journal binding the evidence-append verbs use.
 */
async function recordRunContext(
  runToken: string,
  args: CompleteVerifyStartArgs,
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const binding = deps.journalBinding;
  if (binding === undefined) return { ok: false, error: VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED };
  const event = buildRunContextEvent({
    runToken,
    driveMode: deps.driveMode ?? VERIFY_DRIVE_MODE.CALLER,
    at: deps.now?.() ?? new Date(),
  });
  const journalScope: JournalRunCliScope = {
    type: args.options.verificationType,
    runToken,
    branchSlug: args.branchSlug,
  };
  const appended = await journalAppendCommand(journalScope, event, binding, forwardDeps(deps));
  if (appended.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED}: ${appended.output}` };
  }
  return { ok: true, value: undefined };
}

/** The started-run artifacts a failed start rolls back: the reused-or-created context file, the run file, and the recorded input sidecar. */
interface StartedRunArtifacts {
  readonly contextPath?: string;
  readonly runFile?: string;
  readonly inputRecordPath?: string;
}

function startedRunArtifacts(args: CompleteVerifyStartArgs, runFile?: string): StartedRunArtifacts {
  return {
    ...(args.contextCreated ? { contextPath: args.contextPath } : {}),
    ...(runFile === undefined ? {} : { runFile }),
  };
}

/** Roll back the started-run artifacts, then report the primary error, appending any rollback failure. */
async function rollbackStartAndError(
  artifacts: StartedRunArtifacts,
  primaryError: string,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  const rollback = await removeStartedRunArtifacts(artifacts, deps);
  return errorResult(rollback.ok ? primaryError : `${primaryError}; ${rollback.error}`);
}

async function completeVerifyStartCommand(args: CompleteVerifyStartArgs): Promise<CliCommandResult> {
  const { options, deps } = args;
  const opened = await journalOpenCommand(
    { type: options.verificationType, branchSlug: args.branchSlug },
    forwardDeps(deps),
  );
  if (opened.exitCode !== VERIFY_CLI_EXIT_CODE.OK) {
    return rollbackStartAndError(startedRunArtifacts(args), opened.output, deps);
  }
  const { runToken, runFile } = JSON.parse(opened.output) as { readonly runToken: string; readonly runFile: string };

  const runScope: VerifyRunScope = {
    productDir: args.productDir,
    branchSlug: args.branchSlug,
    type: options.verificationType,
    runToken,
  };
  const recorded: RecordedInput = {
    scopeIdentity: options.scope,
    scopeType: options.scopeType,
    source: options.input,
    digest: args.inputDigest,
    content: args.inputContent,
  };

  // Resolve the recorded-input path up front so the rollback set is known before any local write:
  // every failure branch below then rolls back the artifacts already created, and the run-context
  // append reuses this path rather than re-deriving it. This failure rolls back only the run file
  // and context because the input sidecar is not yet written.
  const inputRecordPath = verifyInputRecordPath(runScope);
  if (!inputRecordPath.ok) {
    return rollbackStartAndError(startedRunArtifacts(args, runFile), inputRecordPath.error, deps);
  }

  const persisted = await persistInputRecord(runScope, recorded, deps);
  if (!persisted.ok) {
    return rollbackStartAndError(startedRunArtifacts(args, runFile), persisted.error, deps);
  }

  // Record the run's drive mode last: the append streams to the backend, and a rollback cannot
  // un-stream an emitted event, so it runs only after every rollbackable local write (run file,
  // context, input sidecar) has succeeded. On failure the sidecar joins the rollback set.
  const runContext = await recordRunContext(runToken, args, deps);
  if (!runContext.ok) {
    return rollbackStartAndError(
      { ...startedRunArtifacts(args, runFile), inputRecordPath: inputRecordPath.value },
      runContext.error,
      deps,
    );
  }

  const namespace = verifyRunsDir(runScope);
  if (!namespace.ok) return errorResult(namespace.error);

  const locator = buildRunLocator({
    runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    scopeIdentity: options.scope,
    backendIdentity: args.backendIdentity,
    storageNamespace: namespace.value,
    runTarget: runFile,
  });
  const report: VerifyStartReport = {
    runToken,
    contextDigest: args.contextDigest,
    resolvedScope: args.resolvedScope,
    input: { source: options.input, digest: args.inputDigest },
    locator,
  };
  return okResult(JSON.stringify(report));
}

/**
 * Start a verification run: resolve its scope, create a canonical
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
  if (options.input.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.INPUT_REQUIRED);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);
  const scope = await resolveVerifyStartScope(options.scopeType, options.scope, resolved.value.worktreeRoot, deps);
  if (!scope.ok) return errorResult(scope.error);
  const normalizedOptions: VerifyStartCliOptions = {
    ...options,
    scopeType: scope.value.selector.scopeType,
    scope: scope.value.selector.scopeIdentity,
  };

  const inputContent = await readStartInputContent(options.input, deps);
  if (!inputContent.ok) return errorResult(inputContent.error);
  const inputDigest = digestRunInput(options.input, inputContent.value);
  if (!inputDigest.ok) return errorResult(inputDigest.error);

  const context = await verificationContextCreateCommand(
    {
      ...scope.value.context,
      predicate: options.verificationType,
      workflow: options.verificationType,
    },
    forwardDeps(deps),
  );
  if (context.exitCode !== VERIFY_CLI_EXIT_CODE.OK) return errorResult(context.output);
  const { digest: contextDigest, contextPath, created: contextCreated } = JSON.parse(context.output) as {
    readonly digest: string;
    readonly contextPath: string;
    readonly created: boolean;
  };

  return completeVerifyStartCommand({
    options: normalizedOptions,
    deps,
    productDir: resolved.value.productDir,
    branchSlug: resolved.value.branchSlug,
    backendIdentity: resolved.value.backendIdentity,
    resolvedScope: scope.value.resolvedScope,
    inputDigest: inputDigest.value,
    inputContent: inputContent.value,
    contextDigest,
    contextPath,
    contextCreated,
  });
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
  readonly existingEvents: readonly JournalEvent[];
  readonly selector: VerifyRunSelector;
}

/** Read append history and reject terminal runs before mutable sidecar state is consulted. */
async function readAppendExistingEvents(
  options: VerifyAppendCliOptions,
  deps: VerifyCliDeps,
  journalScope: JournalRunCliScope,
  backendIdentity: string,
  namespace: string,
): Promise<Result<readonly JournalEvent[]>> {
  const existingEvents = await readRunJournalEvents(journalScope, deps);
  if (!existingEvents.ok) {
    // A missing run reports the addressable run locator; any other read failure (a backend,
    // scope, or storage error) surfaces its real reason rather than masquerading as run-not-found.
    if (existingEvents.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return {
        ok: false,
        error: appendRunNotFoundDiagnostic(options, backendIdentity, namespace),
      };
    }
    return { ok: false, error: `${VERIFY_CLI_ERROR.APPEND_FAILED}: ${existingEvents.error}` };
  }
  if (findTerminalEvent(existingEvents.value) !== undefined) {
    return { ok: false, error: VERIFY_CLI_ERROR.RUN_FINISHED };
  }
  return existingEvents;
}

/**
 * Whether an append invocation is an external caller reaching a run recorded as spx-driven. The
 * executor's own recorder operations assert spx drive mode on their deps; the append verbs expose no
 * drive-mode flag, so a CLI caller carries caller-driven mode and does not assert it.
 */
function isExternalAppendToSpxDrivenRun(events: readonly JournalEvent[], deps: VerifyCliDeps): boolean {
  return (
    driveModeOf(events) === VERIFY_DRIVE_MODE.SPX
    && (deps.driveMode ?? VERIFY_DRIVE_MODE.CALLER) !== VERIFY_DRIVE_MODE.SPX
  );
}

/**
 * Validate the append request's required selectors and injected capabilities, then resolve the
 * run's journal scope and storage namespace, so `verifyAppend` orchestrates a prepared run.
 */
async function prepareAppend(options: VerifyAppendCliOptions, deps: VerifyCliDeps): Promise<Result<PreparedAppend>> {
  if (options.run.trim().length === 0) return { ok: false, error: VERIFY_CLI_ERROR.RUN_REQUIRED };
  if (!isVerifyVerificationType(options.verificationType)) {
    return { ok: false, error: VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE };
  }
  if (options.payload.trim().length === 0) return { ok: false, error: VERIFY_CLI_ERROR.PAYLOAD_REQUIRED };
  if (options.idempotencyKey.trim().length === 0) {
    return { ok: false, error: VERIFY_CLI_ERROR.IDEMPOTENCY_KEY_REQUIRED };
  }
  const selector = normalizeVerifyRunSelector(options.scopeType, options.scope);
  if (!selector.ok) return selector;

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
  const journalScope: JournalRunCliScope = {
    type: options.verificationType,
    runToken: options.run,
    branchSlug: resolved.value.branchSlug,
  };
  const existingEvents = await readAppendExistingEvents(
    options,
    deps,
    journalScope,
    resolved.value.backendIdentity,
    namespace.value,
  );
  if (!existingEvents.ok) return existingEvents;

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
  if (!recordedSelectorMatches(inputRecord.value, selector.value)) {
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

  // An spx-driven run is opened, streamed, and sealed within one executor invocation, so no external
  // caller appends to it — the enforcement counterpart of the next-action projection that hides those
  // actions for it.
  if (isExternalAppendToSpxDrivenRun(existingEvents.value, deps)) {
    return { ok: false, error: VERIFY_CLI_ERROR.SPX_DRIVEN_APPEND_REJECTED };
  }

  return {
    ok: true,
    value: {
      readPayload,
      binding,
      journalScope,
      namespace: namespace.value,
      backendIdentity: resolved.value.backendIdentity,
      existingEvents: existingEvents.value,
      selector: selector.value,
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

/** Validate an evidence payload against its verification type and kind, returning the payload to record. */
function validateAppendEvidence(
  verb: VerifyAppendVerb,
  verificationType: string,
  payload: JsonValue,
  events: readonly JournalEvent[],
  selector: VerifyRunSelector,
): Result<JsonValue> {
  const evidenceKind = verb === VERIFY_VERB.APPEND_FINDING ? VERIFY_EVIDENCE_KIND.FINDING : VERIFY_EVIDENCE_KIND.SCOPE;
  const validator = evidenceValidatorFor(verificationType, evidenceKind);
  if (validator === undefined) return { ok: false, error: VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE };
  const validated = validator({ payload, events, selector });
  if (validated === undefined) {
    return {
      ok: false,
      error: verb === VERIFY_VERB.APPEND_FINDING ? VERIFY_CLI_ERROR.FINDING_INVALID : VERIFY_CLI_ERROR.SCOPE_INVALID,
    };
  }
  return { ok: true, value: JSON.parse(JSON.stringify(validated)) as JsonValue };
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
  const { readPayload, binding, journalScope, existingEvents, selector } = prepared.value;
  const eventType = appendEventType(verb);

  const existing = findAppendedSequence(existingEvents, options.idempotencyKey, eventType);
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
  const evidence = validateAppendEvidence(verb, options.verificationType, parsed, existingEvents, selector);
  if (!evidence.ok) return errorResult(evidence.error);

  const event = buildAppendEvent({
    eventType,
    idempotencyKey: options.idempotencyKey,
    payload: evidence.value,
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
  readonly selector: VerifyRunSelector;
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

function recordedSelectorMatches(record: RecordedInput, selector: VerifyRunSelector): boolean {
  return record.scopeType === selector.scopeType && record.scopeIdentity === selector.scopeIdentity;
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
  if (!isVerifyVerificationType(options.verificationType)) {
    return { ok: false, error: VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE };
  }
  const selector = normalizeVerifyRunSelector(options.scopeType, options.scope);
  if (!selector.ok) return selector;
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
      selector: selector.value,
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
  if (!recordedSelectorMatches(inputRecord.value, address.value.selector)) {
    return { ok: false, error: existingRunSelectorMismatch(address.value, options) };
  }
  const run: VerifyExistingRun = { ...address.value, recordedInput: inputRecord.value };
  return { ok: true, value: run };
}

function isRecordedInputReadFailure(error: string): boolean {
  return error.startsWith(VERIFY_CLI_ERROR.INPUT_READ_FAILED);
}

async function readRecordedInputForProjection(
  run: VerifyExistingRunAddress,
  options: VerifyExistingRunSelector,
  events: readonly JournalEvent[],
  deps: VerifyCliDeps,
): Promise<Result<RecordedInput | undefined>> {
  const terminal = findTerminalEvent(events);
  const inputRecord = await readExistingRecordedInput(run, deps);
  if (!inputRecord.ok) {
    if (terminal !== undefined && isRecordedInputReadFailure(inputRecord.error)) {
      return { ok: true, value: undefined };
    }
    return inputRecord;
  }
  if (inputRecord.value === undefined) return { ok: true, value: undefined };
  if (!recordedSelectorMatches(inputRecord.value, run.selector)) {
    return { ok: false, error: existingRunSelectorMismatch(run, options) };
  }
  return { ok: true, value: inputRecord.value };
}

/** Assemble the terminal projection report a `finish` returns from a run's folded event history. */
function verifyFinishReport(runToken: string, projection: VerifyRunProjection): VerifyFinishReport {
  return {
    runToken,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    ...(projection.terminalMetadata === undefined ? {} : { terminalMetadata: projection.terminalMetadata }),
    sealed: projection.sealed,
    findingCount: projection.findingCount,
    lastSequence: projection.lastSequence,
  };
}

async function isJournalPhysicallySealed(run: VerifyExistingRunAddress, deps: VerifyCliDeps): Promise<Result<boolean>> {
  return isJournalRunSealed(
    { ...run.journalScope, productDir: run.productDir },
    { ...(deps.fs === undefined ? {} : { fs: deps.fs }) },
  );
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

async function readTerminalMetadata(
  options: VerifyFinishCliOptions,
  deps: VerifyCliDeps,
): Promise<Result<JsonValue | undefined>> {
  if (options.terminalMetadata === undefined) return { ok: true, value: undefined };
  const readPayload = deps.readPayloadSource;
  if (readPayload === undefined) return { ok: false, error: VERIFY_CLI_ERROR.TERMINAL_METADATA_INVALID };
  try {
    const rawMetadata = await readPayload(options.terminalMetadata);
    const parsed = parseAppendPayload(rawMetadata);
    if (parsed === undefined) return { ok: false, error: VERIFY_CLI_ERROR.PAYLOAD_INVALID };
    return { ok: true, value: parsed };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.PAYLOAD_READ_FAILED}: ${toMessage(error)}` };
  }
}

function validateTerminalMetadata(
  verificationType: string,
  terminalStatus: string,
  metadata: JsonValue | undefined,
  events: readonly JournalEvent[],
  selector: VerifyRunSelector,
): Result<JsonValue | undefined> {
  const validator = terminalMetadataValidatorFor(verificationType);
  if (validator === undefined) {
    return metadata === undefined
      ? { ok: true, value: undefined }
      : { ok: false, error: VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE };
  }
  const validated = validator({ terminalStatus, metadata, events, selector });
  if (validated.ok) return { ok: true, value: validated.value };
  return {
    ok: false,
    error: validated.error === TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT
      ? VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT
      : VERIFY_CLI_ERROR.TERMINAL_METADATA_INVALID,
  };
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
  if (!physicallySealed.ok) return undefined;
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

  const before = await readRunJournalEvents(run.value.journalScope, deps);
  if (!before.ok) {
    return finishReadFailure(run.value, options, before.error);
  }
  const inputRecord = await readRecordedInputForProjection(run.value, options, before.value, deps);
  if (!inputRecord.ok) return errorResult(inputRecord.error);
  // A run already carrying its terminal event is finished; retry the physical seal when an earlier
  // finish recorded terminal completion but failed to persist the seal marker.
  if (findTerminalEvent(before.value) !== undefined) {
    const retrySeal = await retrySealForTerminalRun(run.value, deps);
    return retrySeal ?? finishProjectionResult(run.value, deps);
  }
  if (inputRecord.value === undefined) {
    return errorResult(existingRunNotFound(run.value, options));
  }
  const rawTerminalMetadata = await readTerminalMetadata(options, deps);
  if (!rawTerminalMetadata.ok) return errorResult(rawTerminalMetadata.error);
  const terminalMetadata = validateTerminalMetadata(
    options.verificationType,
    options.terminalStatus,
    rawTerminalMetadata.value,
    before.value,
    run.value.selector,
  );
  if (!terminalMetadata.ok) return errorResult(terminalMetadata.error);

  // Only the append-and-seal path consumes the journal binding.
  const binding = deps.journalBinding;
  if (binding === undefined) return errorResult(VERIFY_CLI_ERROR.FINISH_FAILED);

  const event = buildTerminalEvent({
    runToken: run.value.runToken,
    terminalStatus: options.terminalStatus,
    ...(terminalMetadata.value === undefined ? {} : { terminalMetadata: terminalMetadata.value }),
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
  const events = await readRunJournalEvents(run.value.journalScope, deps);
  if (!events.ok) {
    if (events.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return errorResult(existingRunNotFound(run.value, options));
    }
    return errorResult(`${VERIFY_CLI_ERROR.STATUS_FAILED}: ${events.error}`);
  }
  const inputRecord = await readRecordedInputForProjection(run.value, options, events.value, deps);
  if (!inputRecord.ok) return errorResult(inputRecord.error);
  if (inputRecord.value === undefined && findTerminalEvent(events.value) === undefined) {
    return errorResult(existingRunNotFound(run.value, options));
  }
  const projection = projectVerifyRun(events.value);
  const report: VerifyStatusReport = {
    runToken: run.value.runToken,
    verificationType: options.verificationType,
    scopeType: options.scopeType,
    sealed: projection.sealed,
    driveMode: projection.driveMode,
    lastSequence: projection.lastSequence,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    ...(projection.terminalMetadata === undefined ? {} : { terminalMetadata: projection.terminalMetadata }),
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
  const events = await readRunJournalEvents(run.value.journalScope, deps);
  if (!events.ok) {
    if (events.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return errorResult(existingRunNotFound(run.value, options));
    }
    return errorResult(`${VERIFY_CLI_ERROR.RENDER_FAILED}: ${events.error}`);
  }
  const inputRecord = await readRecordedInputForProjection(run.value, options, events.value, deps);
  if (!inputRecord.ok) return errorResult(inputRecord.error);
  if (inputRecord.value === undefined && findTerminalEvent(events.value) === undefined) {
    return errorResult(existingRunNotFound(run.value, options));
  }
  const projection = projectVerifyRun(events.value);
  const report: VerifyRenderReport = {
    runToken: run.value.runToken,
    findingCount: projection.findingCount,
    sealed: projection.sealed,
    driveMode: projection.driveMode,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    ...(projection.terminalMetadata === undefined ? {} : { terminalMetadata: projection.terminalMetadata }),
    nextActions: projection.nextActions,
    events: events.value,
  };
  return okResult(JSON.stringify(report));
}
