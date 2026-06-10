import { randomBytes as nodeRandomBytes } from "node:crypto";
import {
  mkdir as nodeMkdir,
  readdir as nodeReaddir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { Result } from "@/config/types";
import { type AuditStorageConfig, DEFAULT_AUDIT_CONFIG } from "@/domains/audit/config";
import {
  AUDIT_RUN_STATE_ERROR,
  AUDIT_RUN_STATE_INCOMPLETE_REASON,
  auditBranchDir,
  type AuditBranchRuns,
  type AuditIncompleteRun,
  type AuditRunDirectory,
  type AuditRunDirectoryEntry,
  auditRunsDir,
  type AuditRunState,
  type AuditRunStateParseResult,
  type AuditTerminalRun,
  formatAuditRunTimestamp,
  generateAuditRunId,
  isAuditRunDirectoryEntry,
  isAuditRunStateStatus,
  parseAuditRunStateContent,
  validateAuditBranchSlug,
} from "@/domains/audit/run-state";

export interface AuditRunStateFileSystem {
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void>;
  rename(source: string, target: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string, options: { readonly withFileTypes: true }): Promise<readonly AuditRunDirectoryEntry[]>;
}

export interface CreateAuditRunDirectoryOptions {
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
  readonly fs?: AuditRunStateFileSystem;
  readonly storage?: AuditStorageConfig;
  readonly maxAttempts?: number;
}

export interface WriteAuditRunStateOptions {
  readonly randomBytes?: (size: number) => Buffer;
  readonly fs?: AuditRunStateFileSystem;
  readonly storage?: AuditStorageConfig;
}

export interface ReadAuditRunStateOptions {
  readonly fs?: AuditRunStateFileSystem;
  readonly storage?: AuditStorageConfig;
}

const RUN_DIRECTORY_CREATE_ATTEMPTS = 10;
const TEMP_STATE_ID_BYTES = 6;
const TEMP_STATE_FILE_PREFIX = ".state";
const TEMP_STATE_FILE_SUFFIX = ".tmp";
const JSON_INDENT_SPACES = 2;
const EXCLUSIVE_CREATE_FLAG = "wx";
const ERROR_CODE_FILE_EXISTS = "EEXIST";
const ERROR_CODE_NOT_FOUND = "ENOENT";
const HEX_ENCODING = "hex";
const RUN_DIRECTORY_SEPARATOR = "-";

const defaultFileSystem: AuditRunStateFileSystem = {
  mkdir: async (path, options) => {
    await nodeMkdir(path, options);
  },
  writeFile: nodeWriteFile,
  rename: nodeRename,
  readFile: nodeReadFile,
  readdir: nodeReaddir,
};

export async function createAuditRunDirectory(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: CreateAuditRunDirectoryOptions = {},
): Promise<Result<AuditRunDirectory>> {
  const fs = options.fs ?? defaultFileSystem;
  const storage = options.storage ?? DEFAULT_AUDIT_CONFIG.storage;
  const validatedBranchSlug = validateAuditBranchSlug(branchSlug);
  if (!validatedBranchSlug.ok) return validatedBranchSlug;
  const maxAttempts = options.maxAttempts ?? RUN_DIRECTORY_CREATE_ATTEMPTS;
  const startedDate = (options.now ?? (() => new Date()))();
  const startedAt = formatAuditRunTimestamp(startedDate);
  const branchDir = auditBranchDir(gitCommonDirProductDir, validatedBranchSlug.value, storage);
  const runsDir = auditRunsDir(gitCommonDirProductDir, validatedBranchSlug.value, storage);
  const randomBytes = options.randomBytes ?? nodeRandomBytes;

  try {
    await fs.mkdir(runsDir, { recursive: true });
  } catch (error) {
    return { ok: false, error: `${AUDIT_RUN_STATE_ERROR.RUN_DIRECTORY_CREATE_FAILED}: ${toErrorMessage(error)}` };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const runId = generateAuditRunId(randomBytes);
    const runDirectoryName = `${startedAt}${RUN_DIRECTORY_SEPARATOR}${runId}`;
    const runDir = join(runsDir, runDirectoryName);
    try {
      await fs.mkdir(runDir);
      return {
        ok: true,
        value: {
          branchDir,
          runsDir,
          runDir,
          runDirectoryName,
          runId,
          startedAt,
        },
      };
    } catch (error) {
      if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) continue;
      return { ok: false, error: `${AUDIT_RUN_STATE_ERROR.RUN_DIRECTORY_CREATE_FAILED}: ${toErrorMessage(error)}` };
    }
  }

  return { ok: false, error: AUDIT_RUN_STATE_ERROR.RUN_DIRECTORY_COLLISION_LIMIT };
}

export async function writeTerminalAuditRunState(
  runDir: string,
  state: AuditRunState,
  options: WriteAuditRunStateOptions = {},
): Promise<Result<string>> {
  if (!isAuditRunStateStatus(state.status)) {
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_TERMINAL_STATE };
  }

  const fs = options.fs ?? defaultFileSystem;
  const storage = options.storage ?? DEFAULT_AUDIT_CONFIG.storage;
  const statePath = join(runDir, storage.stateFile);
  try {
    await fs.readFile(statePath, "utf8");
    return { ok: false, error: AUDIT_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
  } catch (error) {
    if (!hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, error: `${AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED}: ${toErrorMessage(error)}` };
    }
  }

  const tempId = generateHexId(TEMP_STATE_ID_BYTES, options.randomBytes ?? nodeRandomBytes);
  const tempPath = join(runDir, `${TEMP_STATE_FILE_PREFIX}-${tempId}${TEMP_STATE_FILE_SUFFIX}`);
  const serialized = `${JSON.stringify(state, null, JSON_INDENT_SPACES)}\n`;

  try {
    await fs.writeFile(tempPath, serialized, { flag: EXCLUSIVE_CREATE_FLAG });
    await fs.rename(tempPath, statePath);
    return { ok: true, value: statePath };
  } catch (error) {
    return { ok: false, error: `${AUDIT_RUN_STATE_ERROR.STATE_WRITE_FAILED}: ${toErrorMessage(error)}` };
  }
}

export async function readAuditBranchRuns(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: ReadAuditRunStateOptions = {},
): Promise<Result<AuditBranchRuns>> {
  const fs = options.fs ?? defaultFileSystem;
  const storage = options.storage ?? DEFAULT_AUDIT_CONFIG.storage;
  const validatedBranchSlug = validateAuditBranchSlug(branchSlug);
  if (!validatedBranchSlug.ok) return validatedBranchSlug;
  const runsDir = auditRunsDir(gitCommonDirProductDir, validatedBranchSlug.value, storage);
  let entries: readonly AuditRunDirectoryEntry[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: true, value: { terminalRuns: [], incompleteRuns: [] } };
    }
    return { ok: false, error: toErrorMessage(error) };
  }

  const terminalRuns: AuditTerminalRun[] = [];
  const incompleteRuns: AuditIncompleteRun[] = [];
  for (const entry of entries.filter(isAuditRunDirectoryEntry)) {
    const runDir = join(runsDir, entry.name);
    const statePath = join(runDir, storage.stateFile);
    const stateResult = await readAuditRunStatePath(statePath, fs);
    if (stateResult.ok) {
      terminalRuns.push({
        runDirectoryName: entry.name,
        runDir,
        statePath,
        state: stateResult.value,
      });
    } else {
      incompleteRuns.push({
        runDirectoryName: entry.name,
        runDir,
        statePath,
        reason: stateResult.reason,
        error: stateResult.error,
      });
    }
  }

  return { ok: true, value: { terminalRuns, incompleteRuns } };
}

async function readAuditRunStatePath(
  statePath: string,
  fs: AuditRunStateFileSystem,
): Promise<AuditRunStateParseResult> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE };
    }
    return {
      ok: false,
      reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
      error: toErrorMessage(error),
    };
  }

  return parseAuditRunStateContent(raw);
}

function generateHexId(size: number, randomBytes: (size: number) => Buffer): string {
  return randomBytes(size).toString(HEX_ENCODING);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
