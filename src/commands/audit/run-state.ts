import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Result } from "@/config/types";
import {
  AUDIT_RUN_EVENT,
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  type AuditBranchRuns,
  type AuditIncompleteRun,
  auditRunCompletedEventInput,
  type AuditRunState,
  type AuditRunStateParseResult,
  type AuditTerminalRun,
  foldAuditRunState,
  isAuditRunStateStatus,
} from "@/domains/audit/run-state";
import {
  createJournal,
  type JournalEvent,
  type JournalEventInput,
  type JournalIdentity,
} from "@/lib/agent-run-journal";
import { appendableJournalSealMarkerPath, createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  branchScopeDir,
  createJsonlRunFile,
  ERROR_CODE_NOT_FOUND,
  type CreateRunFileOptions,
  defaultStateStoreFileSystem,
  hasErrorCode,
  isRunFileName,
  parseStateStoreError,
  runsDir as stateStoreRunsDir,
  STATE_STORE_DOMAIN,
  STATE_STORE_ERROR,
  STATE_STORE_PATH,
  STATE_STORE_TEXT_ENCODING,
  validateBranchSlug,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
} from "@/lib/state-store";

export interface AuditRunFile {
  readonly branchDir: string;
  readonly runsDir: string;
  readonly runFilePath: string;
  readonly runFileName: string;
  readonly runToken: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface ResolvedAuditRunFilePath {
  readonly branchSlug: string;
  readonly runsDir: string;
  readonly runFilePath: string;
}

export type AuditRunFileEntry = StateStoreFileEntry;
export type AuditRunStateFileSystem = StateStoreFileSystem;
export type CreateAuditRunFileOptions = CreateRunFileOptions;

export interface WriteAuditRunStateOptions {
  // The write path appends and seals through the journal store, which needs the
  // full StateStoreFileSystem (mkdir and writeFile for the run file and seal marker).
  readonly fs?: StateStoreFileSystem;
}

export interface ReadAuditRunStateOptions {
  // The read path binds the appendable journal store, whose construction takes
  // the full StateStoreFileSystem even though folding a run exercises only readFile.
  readonly fs?: StateStoreFileSystem;
}

const AUDIT_RUN_COMPLETED_ATTEMPT = 1;
const AUDIT_RUN_FILE_RELATIVE_SEGMENT_COUNT = 6;
const AUDIT_RUN_FILE_BRANCH_SLUG_INDEX = 2;
const AUDIT_RUN_FILE_NAME_INDEX = 5;
const AUDIT_RUN_FILE_SCOPE_PARENT_COUNT = 5;
const AUDIT_RUNS_DIRECTORY_SCOPE_PARENT_COUNT = 4;

const defaultFileSystem: StateStoreFileSystem = defaultStateStoreFileSystem;

export async function createAuditRunFile(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: CreateAuditRunFileOptions = {},
): Promise<Result<AuditRunFile>> {
  const fs = options.fs ?? defaultFileSystem;
  const branchDir = branchScopeDir(gitCommonDirProductDir, branchSlug);
  if (!branchDir.ok) return branchDir;
  const auditRunsDir = stateStoreRunsDir(branchDir.value, STATE_STORE_DOMAIN.AUDIT);
  if (!auditRunsDir.ok) return auditRunsDir;
  const runsDirSafety = await validateAuditStateDirectoryPath(auditRunsDir.value, fs);
  if (!runsDirSafety.ok) return runsDirSafety;
  const created = await createJsonlRunFile(branchDir.value, STATE_STORE_DOMAIN.AUDIT, options);
  if (!created.ok) {
    return {
      ok: false,
      error: auditRunFileError(created.error),
    };
  }

  return {
    ok: true,
    value: {
      branchDir: branchDir.value,
      runsDir: created.value.runsDir,
      runFilePath: created.value.runFilePath,
      runFileName: created.value.runFileName,
      runToken: created.value.runToken,
      runId: created.value.runId,
      startedAt: created.value.startedAt,
    },
  };
}

export async function writeTerminalAuditRunState(
  gitCommonDirProductDir: string,
  runFilePath: string,
  state: AuditRunState,
  options: WriteAuditRunStateOptions = {},
): Promise<Result<string>> {
  if (!isAuditRunStateStatus(state.status)) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_TERMINAL_STATE };
  }
  const fs = options.fs ?? defaultFileSystem;
  const runFileSafety = await validateExistingAuditRunFile(gitCommonDirProductDir, runFilePath, fs);
  if (!runFileSafety.ok) return runFileSafety;
  const resolvedRunFilePath = runFileSafety.value;
  const sealMarkerSafety = await validateAuditStateFilePath(appendableJournalSealMarkerPath(resolvedRunFilePath), fs);
  if (!sealMarkerSafety.ok) return sealMarkerSafety;
  const backend = createAppendableJournalStore({ runFilePath: resolvedRunFilePath, fs });
  let previousContent: string | undefined;
  let terminalEventAppended = false;
  try {
    // A sealed journal already holds this run's terminal record; the marker read
    // shares the append/seal try block so a marker I/O failure returns a write
    // error rather than throwing out of this Result-returning function.
    if (await backend.isSealed()) {
      return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
    }
    const history = await backend.readAll();
    if (history.some((existing) => existing.type === AUDIT_RUN_EVENT.COMPLETED_TYPE)) {
      return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
    }
    previousContent = await fs.readFile(resolvedRunFilePath, STATE_STORE_TEXT_ENCODING);
    await appendAuditJournalEvent(backend, resolvedRunFilePath, auditRunCompletedEventInput(state, {
      id: `${basename(resolvedRunFilePath)}:${AUDIT_RUN_EVENT.COMPLETED_TYPE}`,
      time: state.completedAt,
      attempt: AUDIT_RUN_COMPLETED_ATTEMPT,
    }));
    terminalEventAppended = true;
    await backend.seal();
  } catch (error) {
    const rollback = terminalEventAppended && previousContent !== undefined
      ? await rollbackTerminalAuditWrite(
        gitCommonDirProductDir,
        resolvedRunFilePath,
        appendableJournalSealMarkerPath(resolvedRunFilePath),
        previousContent,
        fs,
      )
      : { ok: true as const, value: undefined };
    const detail = rollback.ok
      ? toErrorMessage(error)
      : `${toErrorMessage(error)}; rollback failed: ${rollback.error}`;
    return {
      ok: false,
      error: withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, detail),
    };
  }
  return { ok: true, value: resolvedRunFilePath };
}

export async function removeAuditRunFile(
  gitCommonDirProductDir: string,
  runFilePath: string,
  options: WriteAuditRunStateOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultFileSystem;
  const runFileSafety = await validateExistingAuditRunFile(gitCommonDirProductDir, runFilePath, fs);
  if (!runFileSafety.ok) return runFileSafety;
  const resolvedRunFilePath = runFileSafety.value;
  const sealMarkerPath = appendableJournalSealMarkerPath(resolvedRunFilePath);
  const sealMarkerSafety = await validateAuditStateFilePath(sealMarkerPath, fs);
  if (!sealMarkerSafety.ok) return sealMarkerSafety;
  try {
    await fs.rm(sealMarkerPath, { force: true });
    await fs.rm(resolvedRunFilePath, { force: true });
    return { ok: true, value: resolvedRunFilePath };
  } catch (error) {
    return {
      ok: false,
      error: withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, toErrorMessage(error)),
    };
  }
}

export async function appendAuditRunEvent(
  gitCommonDirProductDir: string,
  runFilePath: string,
  event: JournalEventInput,
  options: WriteAuditRunStateOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultFileSystem;
  const runFileSafety = await validateExistingAuditRunFile(gitCommonDirProductDir, runFilePath, fs);
  if (!runFileSafety.ok) return runFileSafety;
  const resolvedRunFilePath = runFileSafety.value;
  const backend = createAppendableJournalStore({ runFilePath: resolvedRunFilePath, fs });
  try {
    if (await backend.isSealed()) {
      return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
    }
    const history = await backend.readAll();
    if (history.some((existing) => existing.type === AUDIT_RUN_EVENT.COMPLETED_TYPE)) {
      return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
    }
    await appendAuditJournalEvent(backend, resolvedRunFilePath, event);
    return { ok: true, value: resolvedRunFilePath };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function readAuditRunEvents(
  gitCommonDirProductDir: string,
  runFilePath: string,
  options: ReadAuditRunStateOptions = {},
): Promise<Result<readonly JournalEvent[]>> {
  const fs = options.fs ?? defaultFileSystem;
  const runFileSafety = await validateExistingAuditRunFile(gitCommonDirProductDir, runFilePath, fs);
  if (!runFileSafety.ok) return runFileSafety;
  const resolvedRunFilePath = runFileSafety.value;
  try {
    return { ok: true, value: await createAppendableJournalStore({ runFilePath: resolvedRunFilePath, fs }).readAll() };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export function resolveAuditRunFilePath(
  gitCommonDirProductDir: string,
  runFilePath: string,
  options: { readonly cwd: string },
): Result<ResolvedAuditRunFilePath> {
  const productDir = resolve(gitCommonDirProductDir);
  const resolvedRunFilePath = resolve(options.cwd, runFilePath);
  const productRelativePath = relative(productDir, resolvedRunFilePath);
  if (isOutsideDirectory(productRelativePath)) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH };
  }

  const segments = productRelativePath.split(sep);
  if (!isAuditRunFileRelativePath(segments)) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH };
  }

  const branchSlug = segments[AUDIT_RUN_FILE_BRANCH_SLUG_INDEX];
  const validatedBranchSlug = validateBranchSlug(branchSlug);
  if (!validatedBranchSlug.ok) return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH };

  const branchDir = branchScopeDir(productDir, validatedBranchSlug.value);
  if (!branchDir.ok) return branchDir;
  const auditRunsDir = stateStoreRunsDir(branchDir.value, STATE_STORE_DOMAIN.AUDIT);
  if (!auditRunsDir.ok) return auditRunsDir;

  if (resolve(dirname(resolvedRunFilePath)) !== resolve(auditRunsDir.value)) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH };
  }

  return {
    ok: true,
    value: {
      branchSlug: validatedBranchSlug.value,
      runsDir: auditRunsDir.value,
      runFilePath: resolvedRunFilePath,
    },
  };
}

export async function readAuditBranchRuns(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: ReadAuditRunStateOptions = {},
): Promise<Result<AuditBranchRuns>> {
  const fs = options.fs ?? defaultFileSystem;
  const branchDir = branchScopeDir(gitCommonDirProductDir, branchSlug);
  if (!branchDir.ok) return branchDir;
  const auditRunsDir = stateStoreRunsDir(branchDir.value, STATE_STORE_DOMAIN.AUDIT);
  if (!auditRunsDir.ok) return auditRunsDir;
  const runsDirSafety = await validateAuditStateDirectoryPath(auditRunsDir.value, fs);
  if (!runsDirSafety.ok) return runsDirSafety;
  let entries: readonly AuditRunFileEntry[];
  try {
    entries = await fs.readdir(auditRunsDir.value, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: true, value: { terminalRuns: [], incompleteRuns: [] } };
    }
    return { ok: false, error: toErrorMessage(error) };
  }

  const terminalRuns: AuditTerminalRun[] = [];
  const incompleteRuns: AuditIncompleteRun[] = [];
  for (const entry of entries.filter(isAuditRunFileNameEntry)) {
    const runFilePath = join(auditRunsDir.value, entry.name);
    const runFileSafety = await validateAuditStateFilePath(runFilePath, fs);
    if (!runFileSafety.ok) return runFileSafety;
    const foldResult = await foldAuditRunJournal(runFilePath, fs);
    if (foldResult.ok) {
      terminalRuns.push({ runFileName: entry.name, runFilePath, state: foldResult.value });
    } else {
      incompleteRuns.push({
        runFileName: entry.name,
        runFilePath,
        reason: foldResult.reason,
        ...(foldResult.error === undefined ? {} : { error: foldResult.error }),
      });
    }
  }

  return { ok: true, value: { terminalRuns, incompleteRuns } };
}

async function foldAuditRunJournal(
  runFilePath: string,
  fs: StateStoreFileSystem,
): Promise<AuditRunStateParseResult> {
  const backend = createAppendableJournalStore({ runFilePath, fs });
  let sealed: boolean;
  let events: readonly JournalEvent[];
  try {
    // The seal marker commits a run as terminal; `readAll` skips malformed and
    // non-conformant lines. Both swallow ENOENT, so only a real I/O failure throws.
    sealed = await backend.isSealed();
    events = await backend.readAll();
  } catch (error) {
    return {
      ok: false,
      reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
      error: toErrorMessage(error),
    };
  }
  // An unsealed run is in progress or its write was interrupted before sealing:
  // its events are not terminal evidence, whatever they hold.
  if (!sealed) {
    return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE };
  }
  return foldAuditRunState(events);
}

function auditRunJournalIdentity(runFilePath: string): JournalIdentity {
  // One run file is one stream's whole history, and the store's readAll returns
  // every line in it regardless of identity, so streamid/runid are stamped into
  // event metadata only — never a read filter. Deriving both from the file name
  // keeps them deterministic from the run path.
  const streamId = basename(runFilePath);
  return { streamid: streamId, runid: streamId };
}

async function appendAuditJournalEvent(
  backend: ReturnType<typeof createAppendableJournalStore>,
  runFilePath: string,
  input: JournalEventInput,
): Promise<void> {
  await createJournal(backend, auditRunJournalIdentity(runFilePath)).append(input);
}

function isAuditRunFileNameEntry(entry: AuditRunFileEntry): boolean {
  return isRunFileName(entry.name);
}

async function validateExistingAuditRunFile(
  gitCommonDirProductDir: string,
  runFilePath: string,
  fs: StateStoreFileSystem,
): Promise<Result<string>> {
  const resolved = resolveAuditRunFilePath(gitCommonDirProductDir, runFilePath, {
    cwd: gitCommonDirProductDir,
  });
  if (!resolved.ok) return resolved;
  const fileSafety = await validateAuditStateFilePath(resolved.value.runFilePath, fs);
  return fileSafety.ok ? { ok: true, value: resolved.value.runFilePath } : fileSafety;
}

async function restoreAuditRunFileContent(
  gitCommonDirProductDir: string,
  runFilePath: string,
  content: string,
  fs: StateStoreFileSystem,
): Promise<Result<void>> {
  const runFileSafety = await validateExistingAuditRunFile(gitCommonDirProductDir, runFilePath, fs);
  if (!runFileSafety.ok) return runFileSafety;
  try {
    await fs.writeFile(runFileSafety.value, content);
    return { ok: true, value: undefined };
  } catch (error) {
    return {
      ok: false,
      error: withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, toErrorMessage(error)),
    };
  }
}

async function rollbackTerminalAuditWrite(
  gitCommonDirProductDir: string,
  runFilePath: string,
  sealMarkerPath: string,
  content: string,
  fs: StateStoreFileSystem,
): Promise<Result<void>> {
  try {
    await fs.rm(sealMarkerPath, { force: true });
  } catch (error) {
    return {
      ok: false,
      error: withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, toErrorMessage(error)),
    };
  }
  return restoreAuditRunFileContent(gitCommonDirProductDir, runFilePath, content, fs);
}

async function validateAuditStateFilePath(
  path: string,
  fs: StateStoreFileSystem,
): Promise<Result<void>> {
  const parentSafety = await validateAuditStateParents(path, fs.lstat, AUDIT_RUN_FILE_SCOPE_PARENT_COUNT);
  if (!parentSafety.ok) return parentSafety;
  try {
    const stats = await fs.lstat(path);
    return stats.isFile() && !stats.isSymbolicLink()
      ? { ok: true, value: undefined }
      : { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: toErrorMessage(error) };
  }
}

async function validateAuditStateDirectoryPath(
  path: string,
  fs: StateStoreFileSystem,
): Promise<Result<void>> {
  const directorySafety = await validateAuditStateDirectory(path, fs.lstat);
  if (!directorySafety.ok) return directorySafety;
  return validateAuditStateParents(path, fs.lstat, AUDIT_RUNS_DIRECTORY_SCOPE_PARENT_COUNT);
}

async function validateAuditStateParents(
  path: string,
  lstat: NonNullable<StateStoreFileSystem["lstat"]>,
  parentCount: number,
): Promise<Result<void>> {
  let parentPath = dirname(path);
  for (let depth = 0; depth < parentCount; depth += 1) {
    const directorySafety = await validateAuditStateDirectory(parentPath, lstat);
    if (!directorySafety.ok) return directorySafety;
    parentPath = dirname(parentPath);
  }
  return { ok: true, value: undefined };
}

async function validateAuditStateDirectory(
  path: string,
  lstat: NonNullable<StateStoreFileSystem["lstat"]>,
): Promise<Result<void>> {
  try {
    const stats = await lstat(path);
    return stats.isDirectory() && !stats.isSymbolicLink()
      ? { ok: true, value: undefined }
      : { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_RUN_FILE_PATH };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: toErrorMessage(error) };
  }
}

function isOutsideDirectory(relativePath: string): boolean {
  return relativePath.length === 0 || relativePath.startsWith("..") || isAbsolute(relativePath);
}

function isAuditRunFileRelativePath(segments: readonly string[]): boolean {
  return segments.length === AUDIT_RUN_FILE_RELATIVE_SEGMENT_COUNT
    && segments[0] === STATE_STORE_PATH.SPX_DIR
    && segments[1] === STATE_STORE_PATH.BRANCH_SCOPE
    && segments[3] === STATE_STORE_DOMAIN.AUDIT
    && segments[4] === STATE_STORE_PATH.RUNS_DIR
    && isRunFileName(segments[AUDIT_RUN_FILE_NAME_INDEX]);
}

function auditRunFileError(error: string): string {
  const stateStoreError = parseStateStoreError(error);
  if (stateStoreError?.code === STATE_STORE_ERROR.RUN_FILE_COLLISION_LIMIT) {
    return AUDIT_RUN_STATE_ERROR.RUN_FILE_COLLISION_LIMIT;
  }
  if (stateStoreError?.code === STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED) {
    return withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.RUN_FILE_CREATE_FAILED, stateStoreError.detail);
  }
  return withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.RUN_FILE_CREATE_FAILED, error);
}

function withDomainErrorDetail(domainError: string, detail: string | undefined): string {
  return detail === undefined ? domainError : `${domainError}: ${detail}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
