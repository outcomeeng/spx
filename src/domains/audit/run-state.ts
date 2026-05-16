import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import {
  mkdir as nodeMkdir,
  readdir as nodeReaddir,
  readFile as nodeReadFile,
  rename as nodeRename,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { Result } from "@/config/types";

import { type AuditStorageConfig, DEFAULT_AUDIT_CONFIG } from "./config";
import { AUDIT_VERDICT_VALUE } from "./reader";

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
  PARSE_INVALID_STATE: "parse-invalid-state",
  SHAPE_INVALID_STATE: "shape-invalid-state",
} as const;

export const AUDIT_RUN_STATE_ERROR = {
  RUN_DIRECTORY_COLLISION_LIMIT: "audit run directory collision limit exhausted",
  RUN_DIRECTORY_CREATE_FAILED: "audit run directory create failed",
  INVALID_BRANCH_SLUG: "audit branch slug must be normalized before storage",
  STATE_ALREADY_EXISTS: "audit run state already exists",
  STATE_WRITE_FAILED: "audit run state write failed",
  INVALID_TERMINAL_STATE: "audit run state must be terminal",
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

export interface AuditRunDirectory {
  readonly branchDir: string;
  readonly runsDir: string;
  readonly runDir: string;
  readonly runDirectoryName: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface AuditTerminalRun {
  readonly runDirectoryName: string;
  readonly runDir: string;
  readonly statePath: string;
  readonly state: AuditRunState;
}

export interface AuditIncompleteRun {
  readonly runDirectoryName: string;
  readonly runDir: string;
  readonly statePath: string;
  readonly reason: AuditRunStateIncompleteReason;
  readonly error?: string;
}

export interface AuditBranchRuns {
  readonly terminalRuns: readonly AuditTerminalRun[];
  readonly incompleteRuns: readonly AuditIncompleteRun[];
}

export interface AuditRunDirectoryEntry {
  readonly name: string;
  isDirectory(): boolean;
}

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

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const HASH_PREFIX_HEX_LENGTH = 8;
const DETACHED_HEAD_PREFIX = "detached";
const DETACHED_HEAD_SHA_HEX_LENGTH = 12;
const RUN_ID_BYTES = 6;
const RUN_DIRECTORY_CREATE_ATTEMPTS = 10;
const TEMP_STATE_ID_BYTES = 6;
const TEMP_STATE_FILE_PREFIX = ".state";
const TEMP_STATE_FILE_SUFFIX = ".tmp";
const JSON_INDENT_SPACES = 2;
const AUDIT_RUN_TIMESTAMP_SEPARATOR = "_";
const AUDIT_RUN_TIMESTAMP_MILLISECOND_DIGITS = 3;
const EXCLUSIVE_CREATE_FLAG = "wx";
const ERROR_CODE_FILE_EXISTS = "EEXIST";
const ERROR_CODE_NOT_FOUND = "ENOENT";
const PATH_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const EDGE_SEPARATOR_PATTERN = /^-|-$/g;
const TRAILING_SEPARATOR_PATTERN = /-+$/;
const BRANCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_SEPARATOR = "-";
const EMPTY_STRING = "";

const defaultFileSystem: AuditRunStateFileSystem = {
  mkdir: async (path, options) => {
    // Normalize nodeMkdir's recursive overload to the injected fs contract.
    await nodeMkdir(path, options);
  },
  writeFile: nodeWriteFile,
  rename: nodeRename,
  readFile: nodeReadFile,
  readdir: nodeReaddir,
};

export function resolveAuditBranchIdentity(input: {
  readonly branchName?: string;
  readonly headSha: string;
}): string {
  if (input.branchName !== undefined && input.branchName.length > 0) return input.branchName;
  return `${DETACHED_HEAD_PREFIX}${SLUG_SEPARATOR}${
    input.headSha.slice(0, DETACHED_HEAD_SHA_HEX_LENGTH).toLowerCase()
  }`;
}

export function slugAuditBranchIdentity(
  branchIdentity: string,
  maxBytes: number = DEFAULT_AUDIT_CONFIG.branchSlug.maxBytes,
): string {
  const hashPrefix = sha256Hex(branchIdentity).slice(0, HASH_PREFIX_HEX_LENGTH);
  const normalizedPrefix = branchIdentity
    .toLowerCase()
    .replace(PATH_SEPARATOR_PATTERN, SLUG_SEPARATOR)
    .replace(EDGE_SEPARATOR_PATTERN, EMPTY_STRING);

  if (normalizedPrefix.length === 0) return hashPrefix;

  const availablePrefixBytes = maxBytes - HASH_PREFIX_HEX_LENGTH - SLUG_SEPARATOR.length;
  if (availablePrefixBytes <= 0) return hashPrefix;

  const prefix = truncateNormalizedSlugPrefix(normalizedPrefix, availablePrefixBytes);
  return prefix.length === 0 ? hashPrefix : `${prefix}${SLUG_SEPARATOR}${hashPrefix}`;
}

export function formatAuditRunTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(AUDIT_RUN_TIMESTAMP_MILLISECOND_DIGITS, "0");

  return `${year}-${month}-${day}${AUDIT_RUN_TIMESTAMP_SEPARATOR}${hours}-${minutes}-${seconds}-${milliseconds}`;
}

export function generateAuditRunId(randomBytes: (size: number) => Buffer = nodeRandomBytes): string {
  return randomBytes(RUN_ID_BYTES).toString(HEX_ENCODING);
}

export function auditBranchDir(
  gitCommonDirProductDir: string,
  branchSlug: string,
  storage: AuditStorageConfig = DEFAULT_AUDIT_CONFIG.storage,
): string {
  const validated = validateAuditBranchSlug(branchSlug);
  if (!validated.ok) throw new Error(validated.error);
  return join(gitCommonDirProductDir, storage.spxDir, storage.auditDir, validated.value);
}

export function auditRunsDir(
  gitCommonDirProductDir: string,
  branchSlug: string,
  storage: AuditStorageConfig = DEFAULT_AUDIT_CONFIG.storage,
): string {
  return join(auditBranchDir(gitCommonDirProductDir, branchSlug, storage), storage.runsDir);
}

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
    const runDirectoryName = `${startedAt}${SLUG_SEPARATOR}${runId}`;
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
  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
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

export function selectLatestTerminalAuditRun(
  runs: readonly AuditTerminalRun[],
): AuditTerminalRun | undefined {
  return runs.reduce<AuditTerminalRun | undefined>((latest, candidate) => {
    if (latest === undefined) return candidate;
    return compareTerminalRuns(latest, candidate) < 0 ? candidate : latest;
  }, undefined);
}

function compareTerminalRuns(left: AuditTerminalRun, right: AuditTerminalRun): number {
  const completed = compareAsciiStrings(left.state.completedAt, right.state.completedAt);
  if (completed !== 0) return completed;
  const started = compareAsciiStrings(left.state.startedAt, right.state.startedAt);
  if (started !== 0) return started;
  return compareAsciiStrings(left.runDirectoryName, right.runDirectoryName);
}

function compareAsciiStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

async function readAuditRunStatePath(
  statePath: string,
  fs: AuditRunStateFileSystem,
): Promise<
  | { readonly ok: true; readonly value: AuditRunState }
  | { readonly ok: false; readonly reason: AuditRunStateIncompleteReason; readonly error?: string }
> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE };
    }
    return {
      ok: false,
      reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE,
      error: toErrorMessage(error),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      ok: false,
      reason: AUDIT_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE,
      error: toErrorMessage(error),
    };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string): string {
  return createHash(SHA256_ALGORITHM).update(value).digest(HEX_ENCODING);
}

function generateHexId(size: number, randomBytes: (size: number) => Buffer): string {
  return randomBytes(size).toString(HEX_ENCODING);
}

function truncateNormalizedSlugPrefix(value: string, maxBytes: number): string {
  return value.slice(0, maxBytes).replace(TRAILING_SEPARATOR_PATTERN, EMPTY_STRING);
}

function validateAuditBranchSlug(branchSlug: string): Result<string> {
  return BRANCH_SLUG_PATTERN.test(branchSlug)
    ? { ok: true, value: branchSlug }
    : { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_BRANCH_SLUG };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
