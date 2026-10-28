import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  journalAppendCommand,
  journalOpenCommand,
  journalReadCommand,
  type JournalRunCliScope,
  journalSealCommand,
  type JournalStreamBinding,
  readJournalCliEnvironment,
} from "@/commands/journal/cli";
import {
  isJournalRunSealed,
  JOURNAL_RUNTIME_ERROR,
  listJournalRuns,
  readJournalEvents,
} from "@/commands/journal/runtime";
import { verificationContextCreateCommand } from "@/commands/verification-context/cli";
import type { CliCommandResult, Result } from "@/config/types";
import { type JournalEdgeBackend, resolveJournalBackend } from "@/domains/journal/backend-selection";
import {
  normalizeVerificationContextFileSubjectPath,
  VERIFICATION_CONTEXT_SUBJECT_KIND,
} from "@/domains/verification-context/context";
import { verificationContextDir } from "@/domains/verification-context/path";
import {
  checkReconcilableRun,
  reconcileScope,
  selectorUnresolvedReason,
  type VerifyScopeReconciliation,
} from "@/domains/verify/reconciliation";
import { renderVerifyRejection, VERIFY_REJECTION_TEXT } from "@/domains/verify/rejection-report";
import {
  type AuditScopeUnit,
  buildAppendEvent,
  buildRunContextEvent,
  buildRunLocator,
  buildTerminalEvent,
  changeInventoryOfNameStatus,
  changeInventoryOfRun,
  type ChangesetScope,
  checkRecordedContentIdentity,
  checkStartContentExpectation,
  digestRunInput,
  driveModeOf,
  evidenceValidatorFor,
  expectationsOfRun,
  expectationsPathError,
  findAppendedSequence,
  findTerminalEvent,
  headCommitOf,
  type InputDescriptor,
  isVerifyChangeIdentity,
  isVerifyTerminalStatus,
  isVerifyVerificationType,
  isVerifyVerifierId,
  isVerifyVerifierKind,
  missingDirectoriesBelow,
  parseAppendPayload,
  parseChangesetScope,
  parseContentNormalization,
  parseStartContentExpectation,
  parseVerifyExpectations,
  projectVerifyRun,
  type RecordedInput,
  runJudgedDeletionsOf,
  runJudgedPathsOf,
  type RunLocator,
  scopeJudgedDeletionsOf,
  scopeJudgedPathsOf,
  type StartContentExpectation,
  TERMINAL_METADATA_VALIDATION_ERROR,
  terminalMetadataValidatorFor,
  validateJudgedDeletionsAgainstInventory,
  validateJudgedPathsAtHead,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_CONTENT_ERROR,
  VERIFY_DRIVE_MODE,
  VERIFY_EVIDENCE_KIND,
  VERIFY_EXPECTATIONS_ERROR,
  VERIFY_INPUT_CHECK_FAILURE,
  VERIFY_INPUT_CHECK_RESULT,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERB,
  VERIFY_VERIFICATION_TYPE,
  type VerifyAppendEventType,
  type VerifyChangeInventoryEntry,
  type VerifyDriveMode,
  type VerifyExpectations,
  type VerifyFindingCounts,
  type VerifyFindingsByDisposition,
  type VerifyInputCheckFailureReport,
  type VerifyInputCheckOutcome,
  verifyInputRecordPath,
  type VerifyRunProjection,
  type VerifyRunScope,
  verifyRunsDir,
  type VerifyRunSelector,
  type VerifyScopeType,
  type VerifyVerifier,
} from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE, type JournalEvent, type JsonValue } from "@/lib/agent-run-journal";
import { writeFileAtomic } from "@/lib/atomic-file-write";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { changedPathsForCommittedRange, nameStatusForCommittedRange } from "@/lib/git/changed-paths";
import { listCommitFiles } from "@/lib/git/commit-files";
import {
  classifyRevisionCommit,
  defaultGitDependencies,
  detectGitCommonDirProductRoot,
  getHeadSha,
  type GitDependencies,
  isHeadUnborn,
  resolveCommitSha,
  REVISION_COMMIT_OUTCOME,
} from "@/lib/git/root";
import {
  defaultStateStoreFileSystem,
  defaultStateStoreRealpath,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  resolveVerificationBranchSlug,
  STATE_STORE_TEXT_ENCODING,
  type StateStoreFileSystem,
  worktreeScopeDir,
} from "@/lib/state-store";
import { SPX_VERIFY_ENV } from "@/lib/verification-env";
import {
  type AvailableContentDigests,
  computeAvailableContentDigests,
  type ContentNormalization,
  decodeLenientUtf8,
} from "@/lib/verification-input";

export const VERIFY_CLI_EXIT_CODE = {
  OK: 0,
  ERROR: 1,
  CHECK_UNAVAILABLE: 2,
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
  CHANGE_INVENTORY_FAILED: "spx verification run could not derive the changeset change inventory",
  INPUT_PERSIST_FAILED: "spx verification run could not persist the recorded run input",
  PAYLOAD_DIRECTORY_FAILED: "spx verification run could not create the run payload directory",
  INPUT_READ_FAILED: "spx verification run could not read the recorded run input",
  PAYLOAD_REQUIRED: "spx verification run evidence-add commands require --payload <payload-source>",
  IDEMPOTENCY_KEY_REQUIRED: "spx verification run evidence-add commands require --idempotency-key <key>",
  PAYLOAD_READ_FAILED: "spx verification run could not read the evidence payload",
  PAYLOAD_INVALID: "spx verification run evidence payload is not valid JSON",
  PAYLOAD_SOURCE_CONFLICT:
    "spx verification run evidence-add commands accept either a payload source or a run-relative payload name, not both",
  PAYLOAD_OUTSIDE_RUN_DIRECTORY:
    "spx verification run evidence payload name resolves outside the run payload directory",
  RUN_FINISHED: "spx verification run cannot add evidence to a finished run",
  SCOPE_INVALID: "spx verification run scope add: evidence payload rejected",
  FINDING_INVALID: "spx verification run finding add: evidence payload rejected",
  UNSUPPORTED_VERIFICATION_TYPE: "spx verification run verification type is not registered",
  CHANGE_IDENTITY_INVALID: "spx verification run start requires a Change identity in the canonical owner/repo#N form",
  VERIFIER_INVALID:
    "spx verification run start requires a Verifier in the <kind>:<id> form with kind person or agent and a non-empty id",
  SPX_DRIVEN_APPEND_REJECTED: "spx verification run cannot add caller evidence to a run spx drives",
  APPEND_FAILED: "spx verification run could not append the evidence event",
  JUDGED_PATHS_UNREADABLE: "spx verification run scope add could not read the files the run's head commit holds",
  TERMINAL_STATUS_REQUIRED: "spx verification run finish requires --terminal-status <status>",
  TERMINAL_STATUS_INVALID:
    "spx verification run finish requires a terminal status in the journal terminal-status vocabulary",
  TERMINAL_METADATA_INVALID: "spx verification run terminal metadata failed verification-type validation",
  TERMINAL_STATUS_CONFLICT: "spx verification run terminal status conflicts with the run's recorded evidence",
  FINISH_FAILED: "spx verification run could not record terminal completion",
  HEAD_COMMIT_UNRESOLVED: "spx verification run start could not resolve the head commit the run judges",
  RUN_CONTEXT_FAILED: "spx verification run could not record the run context",
  EXPECTATIONS_INVALID: "spx verification run start: expectations rejected",
  CONTENT_IDENTITY_REJECTED: "spx verification run start: input content identity rejected",
  INPUT_CHECK_REJECTED: "spx verification run input: content identity check rejected",
  CHECK_FILE_UNREADABLE: "the file to check cannot be read:",
  EXPECTATIONS_SOURCE_UNREADABLE: "the expectations source cannot be read",
  EXPECTATIONS_PATHS_UNREADABLE: "spx verification run start could not read the files the head commit holds",
  SEAL_FAILED: "spx verification run could not seal the run journal",
  STATUS_FAILED: "spx verification run could not read the run status",
  RENDER_FAILED: "spx verification run could not render the run projection",
  PATHS_FAILED: "spx verification run paths could not resolve the run write directories",
  RECONCILE_FAILED: "spx verification run could not read the run for scope reconciliation",
  RECONCILE_REJECTED: "spx verification run scope reconciliation rejected the run",
  FINISH_EXPECTATIONS_MALFORMED: "spx verification run finish refused the run: its recorded expectations are malformed",
} as const;

export const VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD = {
  RUN: "run=",
  CHANGE: "change=",
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
  /** Resolves the symbolic links of an existing path; the write-path report reads directories through it. */
  readonly realpath?: (path: string) => Promise<string>;
  /** Reads the verification input or expectations source as the bytes it holds. */
  readonly readInputSource: (source: string) => Promise<Uint8Array>;
  /** Reads a file a recorded-input replay checks, as the bytes it holds; absent means the file system. */
  readonly readCheckFile?: (path: string) => Promise<Uint8Array>;
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
  /** The Change the run serves, in the canonical `owner/repo#N` form; absent when the run belongs to no Change. */
  readonly change?: string;
  /** The expectations source a changeset-scoped run is bound to: stdin or a file path holding a JSON document; absent when the run is bound to none. */
  readonly expectations?: string;
  /** The Verifier that judges the run, in the `<kind>:<id>` form; absent when the run names none. */
  readonly verifier?: string;
  /** The SHA-256 the input's bytes are expected to have under the content normalization; absent expects none. */
  readonly expectContentSha256?: string;
  /** The content normalization the expected digest is taken under; `none` when absent. */
  readonly contentNormalization?: string;
}

export interface VerifyInputCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
  /** A file whose content identity the replay sets against the digest recorded at start; absent replays the recorded input. */
  readonly checkFile?: string;
  /** The content normalization the check is made under; `none` when absent. */
  readonly contentNormalization?: string;
}

export const VERIFY_START_REPORT_FIELD = {
  RUN_TOKEN: "runToken",
  CONTEXT_DIGEST: "contextDigest",
  RESOLVED_SCOPE: "resolvedScope",
  INPUT: "input",
  LOCATOR: "locator",
  PAYLOAD_DIRECTORY: "payloadDirectory",
} as const;

export interface VerifyStartReport {
  readonly runToken: string;
  readonly contextDigest: string;
  readonly resolvedScope: readonly string[];
  readonly input: InputDescriptor;
  readonly locator: RunLocator;
  /** The run's payload directory at the local worktree root, created by `start`. */
  readonly payloadDirectory: string;
}

/** The directories a verification run writes: its journal runs directory, its verification-context directory, and the payload root holding its payload directory. */
export const VERIFY_WRITE_DIRECTORY_ROLE = {
  JOURNAL_RUNS: "journal-runs",
  VERIFICATION_CONTEXT: "verification-context",
  PAYLOADS: "payloads",
} as const;

/** The path segments below the worktree state directory that address a run's payload directory. */
export const VERIFY_PAYLOAD_PATH = {
  ROOT_SEGMENT: "payloads",
  RUN_DIRECTORY_PREFIX: "run-",
} as const;

/** The payload root of one verification type at the local worktree root: `.spx/worktree/<type>/payloads/`. */
function verifyPayloadRoot(worktreeRoot: string, verificationType: string): string {
  return join(worktreeScopeDir(worktreeRoot), verificationType, VERIFY_PAYLOAD_PATH.ROOT_SEGMENT);
}

/** The payload directory of one run: the payload root of its verification type joined with `run-<run-token>`. */
function verifyRunPayloadDirectory(worktreeRoot: string, verificationType: string, runToken: string): string {
  return join(
    verifyPayloadRoot(worktreeRoot, verificationType),
    `${VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX}${runToken}`,
  );
}

/** The run tokens whose payload directories sit under one verification type's payload root of the worktree. */
async function stagedPayloadRunTokens(
  worktreeRoot: string,
  verificationType: string,
  fs: StateStoreFileSystem,
): Promise<readonly string[]> {
  try {
    const entries = await fs.readdir(verifyPayloadRoot(worktreeRoot, verificationType), { withFileTypes: true });
    return entries
      .filter((entry) => !entry.isFile() && entry.name.startsWith(VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX))
      .map((entry) => entry.name.slice(VERIFY_PAYLOAD_PATH.RUN_DIRECTORY_PREFIX.length));
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND) || hasErrorCode(error, ERROR_CODE_NOT_DIRECTORY)) return [];
    throw error;
  }
}

/** The run tokens of one verification type whose journal, in any branch scope of the repository, is still open. */
async function openRunTokens(
  productDir: string,
  verificationType: string,
  fs: StateStoreFileSystem,
): Promise<ReadonlySet<string>> {
  const runs = await listJournalRuns({ productDir, type: verificationType, limit: Number.POSITIVE_INFINITY }, { fs });
  if (!runs.ok) throw new Error(runs.error);
  const open = new Set<string>();
  for (const run of runs.value) {
    if (run.sealed) continue;
    const ref = { productDir, branchSlug: run.branchSlug, type: verificationType, runToken: run.runToken };
    const events = await readJournalEvents(ref, JOURNAL_SEQ_BASE, { fs });
    if (!events.ok) throw new Error(events.error);
    if (findTerminalEvent(events.value) === undefined) open.add(run.runToken);
  }
  return open;
}

/**
 * Remove the payload directory of every run of the worktree whose journal is closed, by a terminal-completion
 * event or a seal, or that no branch scope of the repository holds a journal for; the directory of an open run stays.
 */
async function sweepClosedPayloadDirectories(
  productDir: string,
  worktreeRoot: string,
  fs: StateStoreFileSystem,
): Promise<void> {
  for (const verificationType of Object.values(VERIFY_VERIFICATION_TYPE)) {
    const staged = await stagedPayloadRunTokens(worktreeRoot, verificationType, fs);
    if (staged.length === 0) continue;
    const open = await openRunTokens(productDir, verificationType, fs);
    for (const runToken of staged) {
      if (open.has(runToken)) continue;
      await fs.rm(verifyRunPayloadDirectory(worktreeRoot, verificationType, runToken), {
        force: true,
        recursive: true,
      });
    }
  }
}

export type VerifyWriteDirectoryRole = (typeof VERIFY_WRITE_DIRECTORY_ROLE)[keyof typeof VERIFY_WRITE_DIRECTORY_ROLE];

export interface VerifyPathsCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
}

export const VERIFY_PATHS_REPORT_FIELD = {
  RESOLVED_SCOPE: "resolvedScope",
  BRANCH_SLUG: "branchSlug",
  WRITE_DIRECTORIES: "writeDirectories",
} as const;

export const VERIFY_WRITE_DIRECTORY_FIELD = {
  ROLE: "role",
  PATH: "path",
  EXISTS: "exists",
  MISSING_DIRECTORIES: "missingDirectories",
} as const;

/** One directory a run writes, at its canonical path, with the directories its creation requires. */
export interface VerifyWriteDirectory {
  readonly [VERIFY_WRITE_DIRECTORY_FIELD.ROLE]: VerifyWriteDirectoryRole;
  readonly [VERIFY_WRITE_DIRECTORY_FIELD.PATH]: string;
  readonly [VERIFY_WRITE_DIRECTORY_FIELD.EXISTS]: boolean;
  readonly [VERIFY_WRITE_DIRECTORY_FIELD.MISSING_DIRECTORIES]: readonly string[];
}

export interface VerifyPathsReport {
  readonly verificationType: string;
  readonly [VERIFY_PATHS_REPORT_FIELD.RESOLVED_SCOPE]: VerifyRunSelector;
  readonly [VERIFY_PATHS_REPORT_FIELD.BRANCH_SLUG]: string;
  readonly [VERIFY_PATHS_REPORT_FIELD.WRITE_DIRECTORIES]: readonly VerifyWriteDirectory[];
}

export interface VerifyInputReport {
  readonly source: string;
  readonly digest: string;
  readonly content: string;
}

/** What a recorded-input replay reports for a checked file. */
export type VerifyInputCheckReport = VerifyInputCheckOutcome;

export interface VerifyAppendCliOptions {
  readonly verificationType: string;
  readonly scopeType: string;
  readonly scope: string;
  readonly run: string;
  readonly payload: string;
  /** A name in the run's payload directory that selects the evidence payload in place of `payload`. */
  readonly runPayload?: string;
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

export interface VerifyReconcileCliOptions {
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
  readonly findingCounts: VerifyFindingCounts;
  readonly lastSequence: number;
}

/** The `status` report fields other consumers address by name. */
export const VERIFY_STATUS_REPORT_FIELD = {
  CHANGE: "change",
  VERIFIER_KIND: "verifierKind",
  VERIFIER_ID: "verifierId",
} as const;

export interface VerifyStatusReport {
  readonly runToken: string;
  readonly verificationType: string;
  readonly scopeType: string;
  readonly sealed: boolean;
  readonly driveMode: string;
  readonly change?: string;
  readonly verifierKind?: string;
  readonly verifierId?: string;
  readonly lastSequence: number;
  readonly terminalStatus?: string;
  readonly terminalMetadata?: JsonValue;
  readonly findingCount: number;
  readonly findingCounts: VerifyFindingCounts;
  readonly nextActions: readonly string[];
}

export interface VerifyRenderReport {
  readonly runToken: string;
  readonly findingCount: number;
  readonly findingCounts: VerifyFindingCounts;
  readonly findings: VerifyFindingsByDisposition;
  readonly sealed: boolean;
  readonly driveMode: string;
  readonly terminalStatus?: string;
  readonly terminalMetadata?: JsonValue;
  readonly nextActions: readonly string[];
  readonly events: readonly JournalEvent[];
  readonly auditScopeUnits: readonly AuditScopeUnit[];
}

interface VerifyResolvedScope {
  readonly productDir: string;
  readonly worktreeRoot: string;
  readonly isGitRepo: boolean;
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

/** A reconciliation that does not reconcile: the structured result on standard output with a non-zero exit. */
function unreconciledResult(reconciliation: VerifyScopeReconciliation): CliCommandResult {
  return {
    exitCode: VERIFY_CLI_EXIT_CODE.ERROR,
    output: JSON.stringify(reconciliation),
    reportOnStdout: true,
  };
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
  const branchSlug = await resolveVerificationBranchSlug({
    cwd,
    isGitRepo: product.isGitRepo,
    git,
    branchOverride: deps.branch ?? processEnv[VERIFY_CLI_ENV.BRANCH],
  });
  const backend = resolveJournalBackend(readJournalCliEnvironment(processEnv).backend);
  if (!backend.ok) return backend;
  return {
    ok: true,
    value: {
      productDir: product.productDir,
      worktreeRoot: product.worktreeRoot,
      isGitRepo: product.isGitRepo,
      branchSlug,
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

/**
 * The outcome of deriving a changeset's change inventory. A failure flags whether the changeset's
 * base or head names no commit; every other failure carries the git error it reports.
 */
type ChangeInventoryResolution =
  | { readonly ok: true; readonly value: readonly VerifyChangeInventoryEntry[] }
  | { readonly ok: false; readonly error: string; readonly selectorUnresolved: boolean };

/** Derive the changeset's change inventory from its null-delimited name-status diff with rename and copy detection. */
async function resolveChangeInventory(
  scope: ChangesetScope,
  productDir: string,
  deps: VerifyCliDeps,
): Promise<ChangeInventoryResolution> {
  const git = deps.git ?? defaultGitDependencies;
  try {
    return {
      ok: true,
      value: changeInventoryOfNameStatus(
        await nameStatusForCommittedRange({ productDir, base: scope.base, head: scope.head, git }),
      ),
    };
  } catch (error) {
    const failure = (error as Error).message;
    for (const revision of [scope.base, scope.head]) {
      const outcome = await classifyRevisionCommit(revision, productDir, git);
      if (outcome.kind === REVISION_COMMIT_OUTCOME.UNRESOLVED) {
        return {
          ok: false,
          error: `${VERIFY_CLI_ERROR.CHANGE_INVENTORY_FAILED}: ${failure}`,
          selectorUnresolved: true,
        };
      }
    }
    return { ok: false, error: `${VERIFY_CLI_ERROR.CHANGE_INVENTORY_FAILED}: ${failure}`, selectorUnresolved: false };
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
  /** The change inventory a changeset-scoped run starts over; absent for a scope that has no base and head. */
  readonly changeInventory?: readonly VerifyChangeInventoryEntry[];
  /**
   * The revision whose commit the run judges: a changeset run judges its range's head. Absent for a
   * scope that judges the checkout's HEAD when `start` runs, so its resolver reads no git state.
   */
  readonly headRevision?: string;
}

type VerifyStartScopeResolver = (
  selector: VerifyRunSelector,
  worktreeRoot: string,
  deps: VerifyCliDeps,
) => Promise<Result<VerifyStartScopeResolution>>;

interface VerifyScopeResolver {
  readonly canonicalize: (scopeIdentity: string) => Result<VerifyRunSelector>;
  readonly resolveStart: VerifyStartScopeResolver;
}

const VERIFY_SCOPE_RESOLVERS: Readonly<Record<VerifyScopeType, VerifyScopeResolver>> = {
  [VERIFY_SCOPE_TYPE.CHANGESET]: {
    canonicalize: (scopeIdentity) => {
      const parsed = parseChangesetScope(scopeIdentity);
      if (!parsed.ok) return parsed;
      return {
        ok: true,
        value: {
          scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
          scopeIdentity: `${parsed.value.base}${VERIFY_SCOPE_SEPARATOR}${parsed.value.head}`,
        },
      };
    },
    resolveStart: async (selector, worktreeRoot, deps) => {
      const changeset = parseChangesetScope(selector.scopeIdentity);
      if (!changeset.ok) return changeset;
      const resolvedScope = await resolveChangedScope(changeset.value, worktreeRoot, deps);
      if (!resolvedScope.ok) return resolvedScope;
      const changeInventory = await resolveChangeInventory(changeset.value, worktreeRoot, deps);
      if (!changeInventory.ok) return { ok: false, error: changeInventory.error };
      return {
        ok: true,
        value: {
          selector,
          changeInventory: changeInventory.value,
          context: {
            subject: VERIFICATION_CONTEXT_SUBJECT_KIND.CHANGESET,
            base: changeset.value.base,
            head: changeset.value.head,
          },
          resolvedScope: resolvedScope.value,
          headRevision: changeset.value.head,
        },
      };
    },
  },
  [VERIFY_SCOPE_TYPE.FILE]: {
    canonicalize: (scopeIdentity) => {
      const normalized = normalizeVerificationContextFileSubjectPath(scopeIdentity);
      return normalized === undefined
        ? { ok: false, error: VERIFY_SCOPE_ERROR.MALFORMED_FILE }
        : { ok: true, value: { scopeType: VERIFY_SCOPE_TYPE.FILE, scopeIdentity: normalized } };
    },
    resolveStart: async (selector) => ({
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
  },
};

function verifyScopeResolverFor(scopeType: string): VerifyScopeResolver | undefined {
  if (!Object.hasOwn(VERIFY_SCOPE_RESOLVERS, scopeType)) return undefined;
  return (VERIFY_SCOPE_RESOLVERS as Readonly<Record<string, VerifyScopeResolver>>)[scopeType];
}

/**
 * Resolve the head commit a starting run judges: the commit the scope's head revision names, or the
 * checkout's HEAD when the scope names none. The commit is recorded once at start, so later readers
 * derive each judged file's content identity from it rather than from a stored digest. Outside a Git
 * repository, and in one whose HEAD is unborn because nothing is committed yet, the run has no head
 * commit to judge, so it records none; such a run still rejects judged paths, which need a recorded
 * head commit. A head revision the scope names must resolve, unborn HEAD or not.
 */
async function resolveStartHeadCommit(
  resolution: VerifyStartScopeResolution,
  resolved: VerifyResolvedScope,
  deps: VerifyCliDeps,
): Promise<Result<string | undefined>> {
  if (!resolved.isGitRepo) return { ok: true, value: undefined };
  const git = deps.git ?? defaultGitDependencies;
  const unresolved: Result<string | undefined> = { ok: false, error: VERIFY_CLI_ERROR.HEAD_COMMIT_UNRESOLVED };
  if (resolution.headRevision !== undefined) {
    const revisionCommit = await resolveCommitSha(resolution.headRevision, resolved.worktreeRoot, git);
    return revisionCommit === null ? unresolved : { ok: true, value: revisionCommit };
  }
  const headCommit = await getHeadSha(resolved.worktreeRoot, git);
  if (headCommit !== null) return { ok: true, value: headCommit };
  return await isHeadUnborn(resolved.worktreeRoot, git) ? { ok: true, value: undefined } : unresolved;
}

function canonicalizeVerifyRunSelector(scopeType: string, scopeIdentity: string): Result<VerifyRunSelector> {
  const resolver = verifyScopeResolverFor(scopeType);
  return resolver === undefined
    ? { ok: false, error: VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE }
    : resolver.canonicalize(scopeIdentity);
}

async function resolveVerifyStartScope(
  scopeType: string,
  scopeIdentity: string,
  worktreeRoot: string,
  deps: VerifyCliDeps,
): Promise<Result<VerifyStartScopeResolution>> {
  const resolver = verifyScopeResolverFor(scopeType);
  if (resolver === undefined) return { ok: false, error: VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE };
  const selector = resolver.canonicalize(scopeIdentity);
  if (!selector.ok) return selector;
  return resolver.resolveStart(selector.value, worktreeRoot, deps);
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

async function readStartInputBytes(
  source: string,
  deps: VerifyCliDeps,
): Promise<Result<Uint8Array>> {
  try {
    return { ok: true, value: await deps.readInputSource(source) };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.INPUT_READ_FAILED}: ${toMessage(error)}` };
  }
}

interface CapturedStartInput {
  readonly content: string;
  readonly digest: string;
  readonly contentDigests: AvailableContentDigests;
}

/** Read the start input's bytes, hold them to the expected content identity, and derive the recorded content and digests. */
async function captureStartInput(
  source: string,
  expectation: StartContentExpectation | undefined,
  deps: VerifyCliDeps,
): Promise<Result<CapturedStartInput>> {
  const bytes = await readStartInputBytes(source, deps);
  if (!bytes.ok) return bytes;
  if (expectation !== undefined) {
    const checked = checkStartContentExpectation(bytes.value, expectation);
    if (!checked.ok) return { ok: false, error: `${VERIFY_CLI_ERROR.CONTENT_IDENTITY_REJECTED}: ${checked.error}` };
  }
  const content = decodeLenientUtf8(bytes.value);
  const digest = digestRunInput(source, content);
  if (!digest.ok) return digest;
  return {
    ok: true,
    value: { content, digest: digest.value, contentDigests: computeAvailableContentDigests(bytes.value) },
  };
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
    && (record.contentDigests === undefined || typeof record.contentDigests === "object")
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

/**
 * Read the input a run recorded at start from its sidecar path, or `undefined` when the run recorded
 * none — the sidecar that marks a journal run as a started verification run.
 */
export async function readVerifyRecordedInput(
  path: string,
  fs: StateStoreFileSystem,
): Promise<Result<RecordedInput | undefined>> {
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
  readonly worktreeRoot: string;
  readonly branchSlug: string;
  readonly backendIdentity: string;
  readonly resolvedScope: readonly string[];
  readonly headCommit: string | undefined;
  readonly changeInventory: readonly VerifyChangeInventoryEntry[] | undefined;
  readonly expectations: VerifyExpectations | undefined;
  readonly inputDigest: string;
  readonly inputContent: string;
  readonly inputContentDigests: AvailableContentDigests;
  readonly contextDigest: string;
  readonly contextPath: string;
  readonly contextCreated: boolean;
}

/** The separator between the kind and the id of a `--verifier <kind>:<id>` operand. */
export const VERIFIER_OPERAND_SEPARATOR = ":";

/** The Verifier a start supplies, or `undefined` when it supplies none or an invalid one. */
function startVerifier(options: VerifyStartCliOptions): VerifyVerifier | undefined {
  if (options.verifier === undefined) return undefined;
  const separatorIndex = options.verifier.indexOf(VERIFIER_OPERAND_SEPARATOR);
  if (separatorIndex < 0) return undefined;
  const kind = options.verifier.slice(0, separatorIndex);
  const id = options.verifier.slice(separatorIndex + VERIFIER_OPERAND_SEPARATOR.length);
  return isVerifyVerifierKind(kind) && isVerifyVerifierId(id) ? { kind, id } : undefined;
}

/** A start supplies either no Verifier or a complete, valid one: a supported kind and a non-empty id together. */
function isValidStartVerifierSelection(options: VerifyStartCliOptions): boolean {
  if (options.verifier === undefined) return true;
  return startVerifier(options) !== undefined;
}

/**
 * Record the run's drive mode and the head commit it judges on a verify-owned run-context event, so
 * status and render fold the drive mode to filter next actions. The caller path defaults to
 * caller-driven; spx execution supplies spx-driven. The append streams through the same journal
 * binding the evidence-append verbs use.
 */
async function recordRunContext(
  runToken: string,
  args: CompleteVerifyStartArgs,
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const binding = deps.journalBinding;
  if (binding === undefined) return { ok: false, error: VERIFY_CLI_ERROR.RUN_CONTEXT_FAILED };
  const verifier = startVerifier(args.options);
  const event = buildRunContextEvent({
    runToken,
    driveMode: deps.driveMode ?? VERIFY_DRIVE_MODE.CALLER,
    ...(args.headCommit === undefined ? {} : { headCommit: args.headCommit }),
    ...(args.options.change === undefined ? {} : { change: args.options.change }),
    ...(args.changeInventory === undefined ? {} : { changeInventory: args.changeInventory }),
    ...(args.expectations === undefined ? {} : { expectations: args.expectations }),
    ...(verifier === undefined ? {} : { verifier }),
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
    contentDigests: args.inputContentDigests,
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

  const payloadDirectory = verifyRunPayloadDirectory(args.worktreeRoot, options.verificationType, runToken);
  try {
    const fs = deps.fs ?? defaultStateStoreFileSystem;
    await sweepClosedPayloadDirectories(args.productDir, args.worktreeRoot, fs);
    await fs.mkdir(payloadDirectory, { recursive: true });
  } catch (error) {
    return rollbackStartAndError(
      { ...startedRunArtifacts(args, runFile), inputRecordPath: inputRecordPath.value },
      `${VERIFY_CLI_ERROR.PAYLOAD_DIRECTORY_FAILED}: ${toMessage(error)}`,
      deps,
    );
  }

  // Record the run context — drive mode and head commit — last: the append streams to the backend, and a rollback cannot
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
    input: { source: options.input, digest: args.inputDigest, contentDigests: args.inputContentDigests },
    locator,
    payloadDirectory,
  };
  return okResult(JSON.stringify(report));
}

/**
 * Validate the expectations a run is started with before any run exists: the document must parse,
 * the run must be changeset-scoped, and every declared additional path must be a file the head
 * commit holds, so a path only the checkout holds is refused. Absent expectations bind the run to none.
 */
async function resolveStartExpectations(
  source: string | undefined,
  scopeType: string,
  headCommit: string | undefined,
  worktreeRoot: string,
  deps: VerifyCliDeps,
): Promise<Result<VerifyExpectations | undefined>> {
  if (source === undefined) return { ok: true, value: undefined };
  const reject = (reason: string): Result<VerifyExpectations | undefined> => ({
    ok: false,
    error: `${VERIFY_CLI_ERROR.EXPECTATIONS_INVALID}: ${reason}`,
  });
  if (scopeType !== VERIFY_SCOPE_TYPE.CHANGESET) return reject(VERIFY_EXPECTATIONS_ERROR.NOT_CHANGESET_SCOPED);
  let document: string;
  try {
    document = decodeLenientUtf8(await deps.readInputSource(source));
  } catch {
    return reject(VERIFY_CLI_ERROR.EXPECTATIONS_SOURCE_UNREADABLE);
  }
  const parsed = parseVerifyExpectations(document);
  if (!parsed.ok) return reject(parsed.error);
  const { additionalPaths } = parsed.value;
  if (additionalPaths.length === 0) return parsed;
  const held = headCommit === undefined
    ? new Set<string>()
    : await listCommitFiles(headCommit, additionalPaths, worktreeRoot, deps.git ?? defaultGitDependencies);
  if (held === undefined) return { ok: false, error: VERIFY_CLI_ERROR.EXPECTATIONS_PATHS_UNREADABLE };
  const unheld = additionalPaths.find((path) => !held.has(path));
  return unheld === undefined
    ? parsed
    : reject(expectationsPathError(unheld, VERIFY_EXPECTATIONS_ERROR.PATH_NOT_HELD));
}

/**
 * Start a verification run: resolve its scope and the head commit it judges, create a canonical
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
  if (options.change !== undefined && !isVerifyChangeIdentity(options.change)) {
    return errorResult(VERIFY_CLI_ERROR.CHANGE_IDENTITY_INVALID);
  }
  if (!isValidStartVerifierSelection(options)) return errorResult(VERIFY_CLI_ERROR.VERIFIER_INVALID);
  if (options.input.trim().length === 0) return errorResult(VERIFY_CLI_ERROR.INPUT_REQUIRED);
  const contentExpectation = parseStartContentExpectation(options.expectContentSha256, options.contentNormalization);
  if (!contentExpectation.ok) {
    return errorResult(`${VERIFY_CLI_ERROR.CONTENT_IDENTITY_REJECTED}: ${contentExpectation.error}`);
  }
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);
  const scope = await resolveVerifyStartScope(options.scopeType, options.scope, resolved.value.worktreeRoot, deps);
  if (!scope.ok) return errorResult(scope.error);
  const headCommit = await resolveStartHeadCommit(scope.value, resolved.value, deps);
  if (!headCommit.ok) return errorResult(headCommit.error);
  const expectations = await resolveStartExpectations(
    options.expectations,
    scope.value.selector.scopeType,
    headCommit.value,
    resolved.value.worktreeRoot,
    deps,
  );
  if (!expectations.ok) return errorResult(expectations.error);
  const normalizedOptions: VerifyStartCliOptions = {
    ...options,
    scopeType: scope.value.selector.scopeType,
    scope: scope.value.selector.scopeIdentity,
  };

  const input = await captureStartInput(options.input, contentExpectation.value, deps);
  if (!input.ok) return errorResult(input.error);

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
    worktreeRoot: resolved.value.worktreeRoot,
    branchSlug: resolved.value.branchSlug,
    backendIdentity: resolved.value.backendIdentity,
    resolvedScope: scope.value.resolvedScope,
    headCommit: headCommit.value,
    changeInventory: scope.value.changeInventory,
    expectations: expectations.value,
    inputDigest: input.value.digest,
    inputContent: input.value.content,
    inputContentDigests: input.value.contentDigests,
    contextDigest,
    contextPath,
    contextCreated,
  });
}

const ERROR_CODE_NOT_DIRECTORY = "ENOTDIR";

/**
 * Locate `path` with the symbolic links of its nearest existing ancestor resolved: the canonical
 * path, whether `path` exists, and the directories missing from that ancestor down. Reads only.
 */
async function locateWriteDirectory(
  role: VerifyWriteDirectoryRole,
  path: string,
  realpath: (path: string) => Promise<string>,
): Promise<Result<VerifyWriteDirectory>> {
  let ancestor = resolve(path);
  for (;;) {
    try {
      const resolvedAncestor = await realpath(ancestor);
      const missingDirectories = missingDirectoriesBelow(ancestor, resolve(path)).map((missing) =>
        join(resolvedAncestor, missing.slice(ancestor.length))
      );
      const canonical = missingDirectories.at(-1) ?? resolvedAncestor;
      return {
        ok: true,
        value: { role, path: canonical, exists: missingDirectories.length === 0, missingDirectories },
      };
    } catch (error) {
      const missing = hasErrorCode(error, ERROR_CODE_NOT_FOUND) || hasErrorCode(error, ERROR_CODE_NOT_DIRECTORY);
      const parent = dirname(ancestor);
      if (!missing || parent === ancestor) {
        return { ok: false, error: `${VERIFY_CLI_ERROR.PATHS_FAILED}: ${toMessage(error)}` };
      }
      ancestor = parent;
    }
  }
}

/**
 * Report, without writing, the directories a run of one verification type and scope writes: the
 * canonical scope identity, the branch key, the journal runs directory and verification-context
 * directory under that branch key at the Git common-dir product root, and the payload root at the
 * local worktree root. A host launching a session
 * that records verification obtains the write paths from this report before the run starts.
 */
export async function verifyPathsCommand(
  options: VerifyPathsCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  if (!isVerifyVerificationType(options.verificationType)) {
    return errorResult(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  }
  const selector = canonicalizeVerifyRunSelector(options.scopeType, options.scope);
  if (!selector.ok) return errorResult(selector.error);
  const resolved = await resolveVerifyScope(deps);
  if (!resolved.ok) return errorResult(resolved.error);
  const { productDir, branchSlug, worktreeRoot } = resolved.value;
  const runs = verifyRunsDir({ productDir, branchSlug, type: options.verificationType });
  if (!runs.ok) return errorResult(runs.error);
  const contexts = verificationContextDir({ productDir, branchSlug });
  if (!contexts.ok) return errorResult(contexts.error);

  const realpath = deps.realpath ?? defaultStateStoreRealpath;
  const writeDirectories: VerifyWriteDirectory[] = [];
  for (
    const [role, path] of [
      [VERIFY_WRITE_DIRECTORY_ROLE.JOURNAL_RUNS, runs.value],
      [VERIFY_WRITE_DIRECTORY_ROLE.VERIFICATION_CONTEXT, contexts.value],
      [VERIFY_WRITE_DIRECTORY_ROLE.PAYLOADS, verifyPayloadRoot(worktreeRoot, options.verificationType)],
    ] as const
  ) {
    const located = await locateWriteDirectory(role, path, realpath);
    if (!located.ok) return errorResult(located.error);
    writeDirectories.push(located.value);
  }
  const report: VerifyPathsReport = {
    verificationType: options.verificationType,
    resolvedScope: selector.value,
    branchSlug,
    writeDirectories,
  };
  return okResult(JSON.stringify(report));
}

/** A check that cannot report equal or different: the structured failure on standard output with the unavailable exit code. */
function checkUnavailableResult(failure: VerifyInputCheckFailureReport): CliCommandResult {
  return {
    exitCode: VERIFY_CLI_EXIT_CODE.CHECK_UNAVAILABLE,
    output: JSON.stringify(failure),
    reportOnStdout: true,
  };
}

/** Set a file's content identity against the digest a run recorded at start, reading the file from its path resolved against the invocation directory. */
async function checkRecordedInputFile(
  record: RecordedInput,
  checkFile: string,
  normalization: ContentNormalization,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  const read = deps.readCheckFile ?? ((path: string) => readFile(path));
  let bytes: Uint8Array;
  try {
    bytes = await read(resolve(deps.cwd ?? CONFIG_PROCESS_CWD.read(), checkFile));
  } catch {
    return checkUnavailableResult({
      result: VERIFY_INPUT_CHECK_FAILURE.CHECK_FILE_UNREADABLE,
      detail: `${VERIFY_CLI_ERROR.CHECK_FILE_UNREADABLE} ${checkFile}`,
    });
  }
  const outcome = checkRecordedContentIdentity(record, normalization, bytes);
  if (!outcome.ok) return checkUnavailableResult(outcome.error);
  const report: VerifyInputCheckReport = outcome.value;
  return {
    exitCode: report.result === VERIFY_INPUT_CHECK_RESULT.EQUAL ? VERIFY_CLI_EXIT_CODE.OK : VERIFY_CLI_EXIT_CODE.ERROR,
    output: JSON.stringify(report),
    reportOnStdout: true,
  };
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
  if (options.checkFile === undefined && options.contentNormalization !== undefined) {
    return errorResult(`${VERIFY_CLI_ERROR.INPUT_CHECK_REJECTED}: ${VERIFY_CONTENT_ERROR.NORMALIZATION_WITHOUT_FILE}`);
  }
  const normalization = parseContentNormalization(options.contentNormalization);
  if (!normalization.ok) return errorResult(`${VERIFY_CLI_ERROR.INPUT_CHECK_REJECTED}: ${normalization.error}`);
  const run = await resolveExistingRun(options, deps);
  if (!run.ok) {
    return options.checkFile === undefined
      ? errorResult(run.error)
      : { exitCode: VERIFY_CLI_EXIT_CODE.CHECK_UNAVAILABLE, output: run.error };
  }
  const record = run.value.recordedInput;
  if (options.checkFile !== undefined) {
    return checkRecordedInputFile(record, options.checkFile, normalization.value, deps);
  }
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
  readonly runPayloadDirectory: string;
  readonly namespace: string;
  readonly backendIdentity: string;
  readonly worktreeRoot: string;
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
 * Report the diagnostic for an append request whose payload source or idempotency key is missing or
 * conflicting. A request names exactly one payload source: the explicit source or a run-relative name.
 */
function appendRequestError(options: VerifyAppendCliOptions): string | undefined {
  const hasPayloadSource = options.payload.trim().length > 0;
  const hasRunPayload = (options.runPayload ?? "").trim().length > 0;
  if (hasPayloadSource === hasRunPayload) {
    return hasPayloadSource ? VERIFY_CLI_ERROR.PAYLOAD_SOURCE_CONFLICT : VERIFY_CLI_ERROR.PAYLOAD_REQUIRED;
  }
  return options.idempotencyKey.trim().length === 0 ? VERIFY_CLI_ERROR.IDEMPOTENCY_KEY_REQUIRED : undefined;
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
  const requestError = appendRequestError(options);
  if (requestError !== undefined) return { ok: false, error: requestError };
  const selector = canonicalizeVerifyRunSelector(options.scopeType, options.scope);
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
  const inputRecord = await readVerifyRecordedInput(inputPath.value, deps.fs ?? defaultStateStoreFileSystem);
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
      runPayloadDirectory: verifyRunPayloadDirectory(
        resolved.value.worktreeRoot,
        options.verificationType,
        options.run,
      ),
      namespace: namespace.value,
      backendIdentity: resolved.value.backendIdentity,
      worktreeRoot: resolved.value.worktreeRoot,
      existingEvents: existingEvents.value,
      selector: selector.value,
    },
  };
}

/**
 * Read the file a run-relative name selects in the run's payload directory. The name and the directory
 * resolve through symbolic links first, and a file whose resolved path lies outside the resolved
 * directory is rejected before any read.
 */
async function readRunPayload(directory: string, name: string, deps: VerifyCliDeps): Promise<Result<string>> {
  const realpath = deps.realpath ?? defaultStateStoreRealpath;
  const fs = deps.fs ?? defaultStateStoreFileSystem;
  let resolvedFile: string;
  try {
    const resolvedDirectory = await realpath(directory);
    resolvedFile = await realpath(resolve(resolvedDirectory, name));
    const fromDirectory = relative(resolvedDirectory, resolvedFile);
    if (fromDirectory === "" || fromDirectory.startsWith("..") || isAbsolute(fromDirectory)) {
      return { ok: false, error: VERIFY_CLI_ERROR.PAYLOAD_OUTSIDE_RUN_DIRECTORY };
    }
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.PAYLOAD_READ_FAILED}: ${toMessage(error)}` };
  }
  try {
    return { ok: true, value: await fs.readFile(resolvedFile, "utf8") };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.PAYLOAD_READ_FAILED}: ${toMessage(error)}` };
  }
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
  if (!validated.ok) {
    // The validator holds the exact check that failed, so the rejection carries its reason to the
    // producer instead of collapsing every malformed payload into one aggregate diagnostic.
    return {
      ok: false,
      error: renderVerifyRejection({
        headline: verb === VERIFY_VERB.APPEND_FINDING
          ? VERIFY_CLI_ERROR.FINDING_INVALID
          : VERIFY_CLI_ERROR.SCOPE_INVALID,
        verificationType,
        evidenceKind,
        reason: validated.reason,
        note: VERIFY_REJECTION_TEXT.APPEND_RETRY_NOTE,
      }),
    };
  }
  return { ok: true, value: JSON.parse(JSON.stringify(validated.value)) as JsonValue };
}

/**
 * Check the judged paths an accepted scope payload names against the files the run's head commit
 * holds, read from the commit's tree through the injected git runner. A payload naming no judged
 * path reads no git state. The run's head commit is the one `start` recorded on the run-context
 * event, so every judged path is anchored to the commit the run judges rather than to the checkout.
 */
async function validateScopeJudgedPaths(
  payload: JsonValue,
  verificationType: string,
  prepared: PreparedAppend,
  deps: VerifyCliDeps,
): Promise<Result<void>> {
  const judgedPaths = scopeJudgedPathsOf(payload);
  if (judgedPaths.length === 0) return { ok: true, value: undefined };
  const headCommit = headCommitOf(prepared.existingEvents);
  const filesHeldAtHead = headCommit === undefined
    ? new Set<string>()
    : await listCommitFiles(headCommit, judgedPaths, prepared.worktreeRoot, deps.git ?? defaultGitDependencies);
  if (filesHeldAtHead === undefined) return { ok: false, error: VERIFY_CLI_ERROR.JUDGED_PATHS_UNREADABLE };
  const held = validateJudgedPathsAtHead(judgedPaths, headCommit, filesHeldAtHead);
  if (held.ok) return { ok: true, value: undefined };
  return {
    ok: false,
    error: renderVerifyRejection({
      headline: VERIFY_CLI_ERROR.SCOPE_INVALID,
      verificationType,
      evidenceKind: VERIFY_EVIDENCE_KIND.SCOPE,
      reason: held.reason,
      note: VERIFY_REJECTION_TEXT.APPEND_RETRY_NOTE,
    }),
  };
}

/**
 * Check the judged deletions an accepted scope payload names against the change inventory the run
 * recorded on its run-context event at start. A payload naming no judged deletion reads nothing.
 */
function validateScopeJudgedDeletions(
  payload: JsonValue,
  verificationType: string,
  prepared: PreparedAppend,
): Result<void> {
  const judgedDeletions = scopeJudgedDeletionsOf(payload);
  if (judgedDeletions.length === 0) return { ok: true, value: undefined };
  const recordedInventory = changeInventoryOfRun(prepared.existingEvents);
  if (!recordedInventory.ok) {
    return {
      ok: false,
      error: renderVerifyRejection({
        headline: VERIFY_CLI_ERROR.SCOPE_INVALID,
        verificationType,
        evidenceKind: VERIFY_EVIDENCE_KIND.SCOPE,
        reason: recordedInventory.error,
        note: VERIFY_REJECTION_TEXT.APPEND_RETRY_NOTE,
      }),
    };
  }
  const listed = validateJudgedDeletionsAgainstInventory(judgedDeletions, recordedInventory.value);
  if (listed.ok) return { ok: true, value: undefined };
  return {
    ok: false,
    error: renderVerifyRejection({
      headline: VERIFY_CLI_ERROR.SCOPE_INVALID,
      verificationType,
      evidenceKind: VERIFY_EVIDENCE_KIND.SCOPE,
      reason: listed.reason,
      note: VERIFY_REJECTION_TEXT.APPEND_RETRY_NOTE,
    }),
  };
}

/** Read the raw evidence payload from the explicit payload source or the run-relative payload name. */
async function readAppendPayload(
  options: VerifyAppendCliOptions,
  prepared: PreparedAppend,
  deps: VerifyCliDeps,
): Promise<Result<string>> {
  if (options.payload.trim().length === 0) {
    return readRunPayload(prepared.runPayloadDirectory, options.runPayload ?? "", deps);
  }
  try {
    return { ok: true, value: await prepared.readPayload(options.payload) };
  } catch (error) {
    return { ok: false, error: `${VERIFY_CLI_ERROR.PAYLOAD_READ_FAILED}: ${toMessage(error)}` };
  }
}

/** The CloudEvents type an evidence-add command records: a finding or inspected scope. */
function appendEventType(verb: VerifyAppendVerb): VerifyAppendEventType {
  return verb === VERIFY_VERB.APPEND_FINDING ? VERIFY_APPEND_EVENT_TYPE.FINDING : VERIFY_APPEND_EVENT_TYPE.SCOPE;
}

/**
 * Append inspected scope or a validated finding to a started run exactly once per idempotency key.
 * The append requires an explicit `--payload` and `--idempotency-key`, validates a finding payload
 * against the run's verification type, checks every judged path a scope payload names against the
 * files the run's head commit holds, and returns the existing journal sequence for a repeated key
 * rather than duplicating evidence. It never reads the recorded run input as the append payload.
 */
async function verifyAppend(
  options: VerifyAppendCliOptions,
  deps: VerifyCliDeps,
  verb: VerifyAppendVerb,
): Promise<CliCommandResult> {
  const prepared = await prepareAppend(options, deps);
  if (!prepared.ok) return errorResult(prepared.error);
  const { binding, journalScope, existingEvents, selector } = prepared.value;
  const eventType = appendEventType(verb);

  const existing = findAppendedSequence(existingEvents, options.idempotencyKey, eventType);
  if (existing !== undefined) {
    const report: VerifyAppendReport = { sequence: existing, idempotent: true };
    return okResult(JSON.stringify(report));
  }

  const rawPayload = await readAppendPayload(options, prepared.value, deps);
  if (!rawPayload.ok) return errorResult(rawPayload.error);
  const parsed = parseAppendPayload(rawPayload.value);
  if (parsed === undefined) return errorResult(VERIFY_CLI_ERROR.PAYLOAD_INVALID);
  const evidence = validateAppendEvidence(verb, options.verificationType, parsed, existingEvents, selector);
  if (!evidence.ok) return errorResult(evidence.error);
  if (verb === VERIFY_VERB.APPEND_SCOPE) {
    const judged = await validateScopeJudgedPaths(evidence.value, options.verificationType, prepared.value, deps);
    if (!judged.ok) return errorResult(judged.error);
    const deletions = validateScopeJudgedDeletions(evidence.value, options.verificationType, prepared.value);
    if (!deletions.ok) return errorResult(deletions.error);
  }

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
  return readVerifyRecordedInput(run.inputRecordPath, deps.fs ?? defaultStateStoreFileSystem);
}

/** Resolve an existing run's journal scope and storage namespace from explicit selectors. */
async function resolveExistingRunAddress(
  options: VerifyExistingRunSelector,
  deps: VerifyCliDeps,
): Promise<Result<VerifyExistingRunAddress>> {
  if (!isVerifyVerificationType(options.verificationType)) {
    return { ok: false, error: VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE };
  }
  const selector = canonicalizeVerifyRunSelector(options.scopeType, options.scope);
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
    findingCounts: projection.findingCounts,
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
    error: renderVerifyRejection({
      headline: validated.error === TERMINAL_METADATA_VALIDATION_ERROR.STATUS_CONFLICT
        ? VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT
        : VERIFY_CLI_ERROR.TERMINAL_METADATA_INVALID,
      verificationType,
      evidenceKind: VERIFY_EVIDENCE_KIND.TERMINAL_METADATA,
      reason: validated.reason,
      note: VERIFY_REJECTION_TEXT.FINISH_RETRY_NOTE,
    }),
  };
}

async function finishProjectionResult(run: VerifyExistingRunAddress, deps: VerifyCliDeps): Promise<CliCommandResult> {
  const events = await readRunJournalEvents(run.journalScope, deps);
  if (!events.ok) return errorResult(`${VERIFY_CLI_ERROR.FINISH_FAILED}: ${events.error}`);
  return okResult(JSON.stringify(verifyFinishReport(run.runToken, projectVerifyRun(events.value))));
}

/**
 * Refuse the first finish of a run bound to expectations whose final recorded evidence does not
 * reconcile, reporting the reconciliation result. An unbound run, and a bound run that reconciles,
 * yield no refusal.
 */
async function refuseUnreconciledBoundRun(
  run: VerifyExistingRunAddress,
  events: readonly JournalEvent[],
  deps: VerifyCliDeps,
): Promise<CliCommandResult | undefined> {
  const expectations = expectationsOfRun(events);
  if (!expectations.ok) return errorResult(`${VERIFY_CLI_ERROR.FINISH_EXPECTATIONS_MALFORMED}: ${expectations.error}`);
  if (expectations.value === undefined) return undefined;
  const reconciliation = await reconcileRunEvidence(run, events, deps);
  if (!reconciliation.ok) return reconciliation.error;
  if (reconciliation.value.reconciled) return undefined;
  return unreconciledResult(reconciliation.value);
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

  const unreconciled = await refuseUnreconciledBoundRun(run.value, before.value, deps);
  if (unreconciled !== undefined) return unreconciled;

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
    ...(projection.change === undefined ? {} : { change: projection.change }),
    ...(projection.verifier === undefined
      ? {}
      : { verifierKind: projection.verifier.kind, verifierId: projection.verifier.id }),
    lastSequence: projection.lastSequence,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    ...(projection.terminalMetadata === undefined ? {} : { terminalMetadata: projection.terminalMetadata }),
    findingCount: projection.findingCount,
    findingCounts: projection.findingCounts,
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
    findingCounts: projection.findingCounts,
    findings: projection.findings,
    sealed: projection.sealed,
    driveMode: projection.driveMode,
    ...(projection.terminalStatus === undefined ? {} : { terminalStatus: projection.terminalStatus }),
    ...(projection.terminalMetadata === undefined ? {} : { terminalMetadata: projection.terminalMetadata }),
    nextActions: projection.nextActions,
    events: events.value,
    auditScopeUnits: projection.auditScopeUnits,
  };
  return okResult(JSON.stringify(report));
}

/**
 * Reconcile a changeset run's recorded evidence against the inventory its changeset selector resolves
 * to now. A rejection or read failure is carried as the command result the caller returns. The
 * reconciliation reads the repository and appends no event.
 */
async function reconcileRunEvidence(
  run: VerifyExistingRunAddress,
  events: readonly JournalEvent[],
  deps: VerifyCliDeps,
): Promise<
  { readonly ok: true; readonly value: VerifyScopeReconciliation } | {
    readonly ok: false;
    readonly error: CliCommandResult;
  }
> {
  const failed = (message: string) => ({ ok: false as const, error: errorResult(message) });
  const recordedContext = changeInventoryOfRun(events);
  if (!recordedContext.ok) return failed(`${VERIFY_CLI_ERROR.RECONCILE_REJECTED}: ${recordedContext.error}`);
  const recordedInventory = checkReconcilableRun(run.selector.scopeType, recordedContext.value);
  if (!recordedInventory.ok) return failed(`${VERIFY_CLI_ERROR.RECONCILE_REJECTED}: ${recordedInventory.error}`);
  const expectations = expectationsOfRun(events);
  if (!expectations.ok) return failed(`${VERIFY_CLI_ERROR.RECONCILE_REJECTED}: ${expectations.error}`);
  const unresolved = failed(
    `${VERIFY_CLI_ERROR.RECONCILE_REJECTED}: ${selectorUnresolvedReason(run.selector.scopeIdentity)}`,
  );
  const changeset = parseChangesetScope(run.selector.scopeIdentity);
  if (!changeset.ok) return unresolved;
  const resolvedScope = await resolveVerifyScope(deps);
  if (!resolvedScope.ok) return failed(`${VERIFY_CLI_ERROR.RECONCILE_FAILED}: ${resolvedScope.error}`);
  const resolvedInventory = await resolveChangeInventory(changeset.value, resolvedScope.value.worktreeRoot, deps);
  if (!resolvedInventory.ok) {
    return resolvedInventory.selectorUnresolved
      ? unresolved
      : failed(`${VERIFY_CLI_ERROR.RECONCILE_FAILED}: ${resolvedInventory.error}`);
  }
  return {
    ok: true,
    value: reconcileScope({
      recordedInventory: recordedInventory.value,
      expectations: expectations.value,
      judgedPaths: runJudgedPathsOf(events),
      judgedDeletions: runJudgedDeletionsOf(events),
      resolvedInventory: resolvedInventory.value,
    }),
  };
}

/**
 * Reconcile a started changeset run's judged scope against the inventory its changeset selector
 * resolves to, reporting the unaccounted, unexpected, and drifted paths as one structured result.
 * The operation reads the run's event history and the repository and appends no event, seals no
 * run, and changes no working tree, index, or ref.
 */
export async function verifyReconcileCommand(
  options: VerifyReconcileCliOptions,
  deps: VerifyCliDeps,
): Promise<CliCommandResult> {
  const run = await resolveExistingRunAddress(options, deps);
  if (!run.ok) return errorResult(run.error);
  const events = await readRunJournalEvents(run.value.journalScope, deps);
  if (!events.ok) {
    if (events.error === JOURNAL_RUNTIME_ERROR.RUN_NOT_FOUND) {
      return errorResult(existingRunNotFound(run.value, options));
    }
    return errorResult(`${VERIFY_CLI_ERROR.RECONCILE_FAILED}: ${events.error}`);
  }
  const inputRecord = await readRecordedInputForProjection(run.value, options, events.value, deps);
  if (!inputRecord.ok) return errorResult(inputRecord.error);
  if (inputRecord.value === undefined && findTerminalEvent(events.value) === undefined) {
    return errorResult(existingRunNotFound(run.value, options));
  }
  const report = await reconcileRunEvidence(run.value, events.value, deps);
  if (!report.ok) return report.error;
  return report.value.reconciled ? okResult(JSON.stringify(report.value)) : unreconciledResult(report.value);
}
