import { basename, join } from "node:path";

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
import { createJournal, JOURNAL_ERROR, type JournalIdentity } from "@/lib/agent-run-journal";
import { createAppendableJournalStore } from "@/lib/appendable-journal-store";
import {
  branchScopeDir,
  createJsonlRunFile,
  type CreateRunFileOptions,
  defaultStateStoreFileSystem,
  hasErrorCode,
  isRunFileName,
  parseStateStoreError,
  runsDir as stateStoreRunsDir,
  STATE_STORE_DOMAIN,
  STATE_STORE_ERROR,
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

export type AuditRunFileEntry = StateStoreFileEntry;
export type AuditRunStateFileSystem = StateStoreFileSystem;
export type CreateAuditRunFileOptions = CreateRunFileOptions;

export interface WriteAuditRunStateOptions {
  readonly fs?: StateStoreFileSystem;
}

export interface ReadAuditRunStateOptions {
  readonly fs?: StateStoreFileSystem;
}

const ERROR_CODE_NOT_FOUND = "ENOENT";
const AUDIT_RUN_COMPLETED_ATTEMPT = 1;

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
  const fs = options.fs ?? defaultFileSystem;
  const journal = createJournal(
    createAppendableJournalStore({ runFilePath, fs }),
    auditRunJournalIdentity(runFilePath),
  );
  try {
    await journal.append(
      auditRunCompletedEventInput(state, {
        id: `${basename(runFilePath)}:${AUDIT_RUN_EVENT.COMPLETED_TYPE}`,
        time: state.completedAt,
        attempt: AUDIT_RUN_COMPLETED_ATTEMPT,
      }),
    );
    await journal.seal();
  } catch (error) {
    if (toErrorMessage(error) === JOURNAL_ERROR.SEALED) {
      return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
    }
    return {
      ok: false,
      error: withDomainErrorDetail(AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED, toErrorMessage(error)),
    };
  }
  return { ok: true, value: runFilePath };
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
  try {
    // `readAll` skips malformed and non-conformant lines per the appendable
    // journal store contract, so a partial or corrupt run file folds to
    // MISSING_STATE (no completed event) rather than throwing.
    return foldAuditRunState(await backend.readAll());
  } catch (error) {
    return {
      ok: false,
      reason: hasErrorCode(error, ERROR_CODE_NOT_FOUND)
        ? AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE
        : AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
      error: toErrorMessage(error),
    };
  }
}

function auditRunJournalIdentity(runFilePath: string): JournalIdentity {
  const streamId = basename(runFilePath);
  return { streamid: streamId, runid: streamId };
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

function withDomainErrorDetail(domainError: string, detail: string | undefined): string {
  return detail === undefined ? domainError : `${domainError}: ${detail}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
