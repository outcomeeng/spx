import {
  mkdir as nodeMkdir,
  readdir as nodeReaddir,
  readFile as nodeReadFile,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  branchScopeDir,
  createJsonlRunFile,
  type CreateRunFileOptions,
  formatRunTimestamp,
  isRunFileName,
  type JsonRecord,
  resolveBranchIdentity,
  runFileName,
  runsDir as stateStoreRunsDir,
  slugBranchIdentity,
  STATE_STORE_DOMAIN,
  STATE_STORE_ERROR,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
  type StateStoreJsonlReaderFileSystem,
  type StateStoreRunReaderFileSystem,
  writeJsonlRunRecord,
} from "@/lib/state-store";

import { AUDIT_VERDICT_VALUE } from "./reader";

export {
  formatRunTimestamp as formatAuditRunTimestamp,
  resolveBranchIdentity as resolveAuditBranchIdentity,
  slugBranchIdentity as slugAuditBranchIdentity,
};

export const AUDIT_RUN_STATE_STATUS = {
  APPROVED: "approved",
  REJECTED: "rejected",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
} as const;

export const AUDIT_RUN_STATE_DISPLAY = {
  [AUDIT_RUN_STATE_STATUS.APPROVED]: "APPROVED",
  [AUDIT_RUN_STATE_STATUS.REJECTED]: AUDIT_VERDICT_VALUE.REJECT,
  [AUDIT_RUN_STATE_STATUS.FAILED]: "FAILED",
  [AUDIT_RUN_STATE_STATUS.INTERRUPTED]: "INTERRUPTED",
} as const;

export const AUDIT_RUN_STATE_FIELDS = {
  BRANCH_NAME: "branchName",
  BRANCH_SLUG: "branchSlug",
  HEAD_SHA: "headSha",
  BASE_REF: "baseRef",
  AUDIT_CONFIG_DIGEST: "auditConfigDigest",
  AUDITORS: "auditors",
  TARGETS: "targets",
  STARTED_AT: "startedAt",
  COMPLETED_AT: "completedAt",
  VERDICT_PATH: "verdictPath",
  STATUS: "status",
} as const;

export const AUDIT_RUN_STATE_INCOMPLETE_REASON = {
  MISSING_STATE: "missing-state",
  IO_ERROR: "io-error",
  PARSE_INVALID_STATE: "parse-invalid-state",
  SHAPE_INVALID_STATE: "shape-invalid-state",
} as const;

export const AUDIT_RUN_STATE_ERROR = {
  RUN_FILE_COLLISION_LIMIT: "audit run file collision limit exhausted",
  RUN_FILE_CREATE_FAILED: "audit run file create failed",
  INVALID_TERMINAL_STATE: "audit run state must be terminal",
  STATE_ALREADY_EXISTS: "audit run state already exists",
  STATE_WRITE_FAILED: "audit run state write failed",
} as const;

export type AuditRunStateStatus = (typeof AUDIT_RUN_STATE_STATUS)[keyof typeof AUDIT_RUN_STATE_STATUS];
export type AuditRunStateIncompleteReason =
  (typeof AUDIT_RUN_STATE_INCOMPLETE_REASON)[keyof typeof AUDIT_RUN_STATE_INCOMPLETE_REASON];

export interface AuditRunState {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly auditConfigDigest: string;
  readonly auditors: readonly string[];
  readonly targets: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly verdictPath?: string;
  readonly status: AuditRunStateStatus;
}

export interface AuditRunFile {
  readonly branchDir: string;
  readonly runsDir: string;
  readonly runFilePath: string;
  readonly runFileName: string;
  readonly runToken: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface AuditTerminalRun {
  readonly runFileName: string;
  readonly runFilePath: string;
  readonly state: AuditRunState;
}

export interface AuditIncompleteRun {
  readonly runFileName: string;
  readonly runFilePath: string;
  readonly reason: AuditRunStateIncompleteReason;
  readonly error?: string;
}

export interface AuditBranchRuns {
  readonly terminalRuns: readonly AuditTerminalRun[];
  readonly incompleteRuns: readonly AuditIncompleteRun[];
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
const EMPTY_STRING = "";
const JSONL_LINE_SEPARATOR = "\n";

const defaultFileSystem: StateStoreFileSystem = {
  mkdir: async (path, options) => {
    await nodeMkdir(path, options);
  },
  writeFile: nodeWriteFile,
  appendFile: async () => {},
  readFile: nodeReadFile,
  readdir: nodeReaddir,
};

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
      error: created.error
        .replace(STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED, AUDIT_RUN_STATE_ERROR.RUN_FILE_CREATE_FAILED)
        .replace(STATE_STORE_ERROR.RUN_FILE_COLLISION_LIMIT, AUDIT_RUN_STATE_ERROR.RUN_FILE_COLLISION_LIMIT),
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
    error: written.error.replace(STATE_STORE_ERROR.RECORD_WRITE_FAILED, AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED),
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

export function selectLatestTerminalAuditRun(
  runs: readonly AuditTerminalRun[],
): AuditTerminalRun | undefined {
  return runs.reduce<AuditTerminalRun | undefined>((latest, candidate) => {
    if (latest === undefined) return candidate;
    return compareTerminalRuns(latest, candidate) < 0 ? candidate : latest;
  }, undefined);
}

export function auditRunFileName(runToken: string): string {
  return runFileName(runToken);
}

function auditRunStateRecord(state: AuditRunState): JsonRecord {
  return {
    branchName: state.branchName,
    branchSlug: state.branchSlug,
    headSha: state.headSha,
    baseRef: state.baseRef,
    auditConfigDigest: state.auditConfigDigest,
    auditors: state.auditors,
    targets: state.targets,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    ...(state.verdictPath === undefined ? {} : { verdictPath: state.verdictPath }),
    status: state.status,
  };
}

async function readAuditRunStatePath(
  runFilePath: string,
  fs: StateStoreJsonlReaderFileSystem,
): Promise<
  | { readonly ok: true; readonly value: AuditRunState }
  | { readonly ok: false; readonly reason: AuditRunStateIncompleteReason; readonly error?: string }
> {
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

  const latest = latestNonEmptyLine(content);
  if (latest === undefined) {
    return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(latest) as unknown;
  } catch {
    return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE };
  }

  const validated = validateAuditRunState(parsed);
  if (!validated.ok) {
    return {
      ok: false,
      reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE,
      error: validated.error,
    };
  }
  return validated;
}

function validateAuditRunState(value: unknown): Result<AuditRunState> {
  if (!isRecord(value)) return { ok: false, error: "audit run state must be an object" };
  const branchName = readString(value, AUDIT_RUN_STATE_FIELDS.BRANCH_NAME);
  if (!branchName.ok) return branchName;
  const branchSlug = readString(value, AUDIT_RUN_STATE_FIELDS.BRANCH_SLUG);
  if (!branchSlug.ok) return branchSlug;
  const headSha = readString(value, AUDIT_RUN_STATE_FIELDS.HEAD_SHA);
  if (!headSha.ok) return headSha;
  const baseRef = readString(value, AUDIT_RUN_STATE_FIELDS.BASE_REF);
  if (!baseRef.ok) return baseRef;
  const auditConfigDigest = readString(value, AUDIT_RUN_STATE_FIELDS.AUDIT_CONFIG_DIGEST);
  if (!auditConfigDigest.ok) return auditConfigDigest;
  const auditors = readStringArray(value, AUDIT_RUN_STATE_FIELDS.AUDITORS);
  if (!auditors.ok) return auditors;
  const targets = readStringArray(value, AUDIT_RUN_STATE_FIELDS.TARGETS);
  if (!targets.ok) return targets;
  const startedAt = readString(value, AUDIT_RUN_STATE_FIELDS.STARTED_AT);
  if (!startedAt.ok) return startedAt;
  const completedAt = readString(value, AUDIT_RUN_STATE_FIELDS.COMPLETED_AT);
  if (!completedAt.ok) return completedAt;
  const status = readStatus(value, AUDIT_RUN_STATE_FIELDS.STATUS);
  if (!status.ok) return status;
  const verdictPathRaw = value[AUDIT_RUN_STATE_FIELDS.VERDICT_PATH];
  if (verdictPathRaw !== undefined && typeof verdictPathRaw !== "string") {
    return { ok: false, error: `${AUDIT_RUN_STATE_FIELDS.VERDICT_PATH} must be a string` };
  }

  return {
    ok: true,
    value: {
      branchName: branchName.value,
      branchSlug: branchSlug.value,
      headSha: headSha.value,
      baseRef: baseRef.value,
      auditConfigDigest: auditConfigDigest.value,
      auditors: auditors.value,
      targets: targets.value,
      startedAt: startedAt.value,
      completedAt: completedAt.value,
      ...(verdictPathRaw === undefined ? {} : { verdictPath: verdictPathRaw }),
      status: status.value,
    },
  };
}

function compareTerminalRuns(left: AuditTerminalRun, right: AuditTerminalRun): number {
  const completed = compareAsciiStrings(left.state.completedAt, right.state.completedAt);
  if (completed !== 0) return completed;
  const started = compareAsciiStrings(left.state.startedAt, right.state.startedAt);
  if (started !== 0) return started;
  return compareAsciiStrings(left.runFileName, right.runFileName);
}

function compareAsciiStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function readString(value: Record<string, unknown>, field: string): Result<string> {
  const raw = value[field];
  return typeof raw === "string" && raw.length > 0
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a non-empty string` };
}

function readStringArray(value: Record<string, unknown>, field: string): Result<readonly string[]> {
  const raw = value[field];
  return Array.isArray(raw) && raw.every((entry) => typeof entry === "string" && entry.length > 0)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be an array of non-empty strings` };
}

function readStatus(value: Record<string, unknown>, field: string): Result<AuditRunStateStatus> {
  const raw = value[field];
  return isAuditRunStateStatus(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a terminal audit status` };
}

function isAuditRunStateStatus(value: unknown): value is AuditRunStateStatus {
  return typeof value === "string" && Object.values(AUDIT_RUN_STATE_STATUS).includes(value as AuditRunStateStatus);
}

function isAuditRunFileEntry(entry: AuditRunFileEntry): boolean {
  return entry.isFile() && isRunFileName(entry.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function latestNonEmptyLine(content: string): string | undefined {
  const lines = content.split(JSONL_LINE_SEPARATOR);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? EMPTY_STRING;
    if (line.length > 0) return line;
  }
  return undefined;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
