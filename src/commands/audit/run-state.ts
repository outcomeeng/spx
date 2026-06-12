import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  auditRunStateRecord,
  type AuditBranchRuns,
  type AuditIncompleteRun,
  type AuditRunState,
  type AuditRunStateParseResult,
  type AuditTerminalRun,
  isAuditRunStateStatus,
  parseAuditRunStateContent,
} from "@/domains/audit/run-state";
import {
  branchScopeDir,
  createJsonlRunFile,
  defaultStateStoreFileSystem,
  isRunFileName,
  latestNonEmptyJsonlLine,
  parseStateStoreError,
  runsDir as stateStoreRunsDir,
  STATE_STORE_DOMAIN,
  STATE_STORE_ERROR,
  type CreateRunFileOptions,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
  type StateStoreJsonlReaderFileSystem,
  type StateStoreRunReaderFileSystem,
  writeJsonlRunRecord,
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

export type AuditRunFileEntry = StateStoreFileEntry;
export type AuditRunStateFileSystem = StateStoreFileSystem;
export type CreateAuditRunFileOptions = CreateRunFileOptions;

export interface WriteAuditRunStateOptions {
  readonly fs?: StateStoreFileSystem;
}

export interface ReadAuditRunStateOptions {
  readonly fs?: StateStoreRunReaderFileSystem;
}

const ERROR_CODE_NOT_FOUND = "ENOENT";

const defaultFileSystem: StateStoreFileSystem = defaultStateStoreFileSystem;

export async function createAuditRunFile(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: CreateAuditRunFileOptions = {},
): Promise<Result<AuditRunFile>> {
  const branchDir = branchScopeDir(gitCommonDirProductDir, branchSlug);
  if (!branchDir.ok) return branchDir;
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
  runFilePath: string,
  state: AuditRunState,
  options: WriteAuditRunStateOptions = {},
): Promise<Result<string>> {
  if (!isAuditRunStateStatus(state.status)) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_TERMINAL_STATE };
  }
  const written = await writeJsonlRunRecord(runFilePath, auditRunStateRecord(state), options);
  if (written.ok) return written;
  if (written.error === STATE_STORE_ERROR.RECORD_ALREADY_EXISTS) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
  }
  return {
    ok: false,
    error: auditWriteError(written.error),
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
  for (const entry of entries.filter(isAuditRunFileEntry)) {
    const runFilePath = join(auditRunsDir.value, entry.name);
    const stateResult = await readAuditRunStatePath(runFilePath, fs);
    if (stateResult.ok) {
      terminalRuns.push({ runFileName: entry.name, runFilePath, state: stateResult.value });
    } else {
      incompleteRuns.push({
        runFileName: entry.name,
        runFilePath,
        reason: stateResult.reason,
        ...(stateResult.error === undefined ? {} : { error: stateResult.error }),
      });
    }
  }

  return { ok: true, value: { terminalRuns, incompleteRuns } };
}

async function readAuditRunStatePath(
  runFilePath: string,
  fs: StateStoreJsonlReaderFileSystem,
): Promise<AuditRunStateParseResult> {
  let content: string;
  try {
    content = await fs.readFile(runFilePath, "utf8");
  } catch (error) {
    return {
      ok: false,
      reason: hasErrorCode(error, ERROR_CODE_NOT_FOUND)
        ? AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE
        : AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
      error: toErrorMessage(error),
    };
  }

  const latest = latestNonEmptyJsonlLine(content);
  if (latest === undefined) {
    return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE };
  }

  return parseAuditRunStateContent(latest);
}

function isAuditRunFileEntry(entry: AuditRunFileEntry): boolean {
  return entry.isFile() && isRunFileName(entry.name);
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

function auditWriteError(error: string): string {
  const stateStoreError = parseStateStoreError(error);
  if (stateStoreError?.code === STATE_STORE_ERROR.RECORD_WRITE_FAILED) {
    return withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, stateStoreError.detail);
  }
  return withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, error);
}

function withDomainErrorDetail(domainError: string, detail: string | undefined): string {
  return detail === undefined ? domainError : `${domainError}: ${detail}`;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
