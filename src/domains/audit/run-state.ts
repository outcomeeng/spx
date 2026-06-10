import { createHash } from "node:crypto";
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
  IO_ERROR: "io-error",
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

export type AuditRunStateParseResult =
  | { readonly ok: true; readonly value: AuditRunState }
  | { readonly ok: false; readonly reason: AuditRunStateIncompleteReason; readonly error?: string };

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const HASH_PREFIX_HEX_LENGTH = 8;
const DETACHED_HEAD_PREFIX = "detached";
const DETACHED_HEAD_SHA_HEX_LENGTH = 12;
const RUN_ID_BYTES = 6;
const AUDIT_RUN_TIMESTAMP_SEPARATOR = "_";
const AUDIT_RUN_TIMESTAMP_MILLISECOND_DIGITS = 3;
const PATH_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const EDGE_SEPARATOR_PATTERN = /^-|-$/g;
const TRAILING_SEPARATOR_PATTERN = /-+$/;
const BRANCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_DIRECTORY_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[a-f0-9]{12}$/;
const SLUG_SEPARATOR = "-";
const EMPTY_STRING = "";

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
  const boundedHashPrefix = hashPrefix.slice(0, Math.max(0, maxBytes));
  const normalizedPrefix = branchIdentity
    .toLowerCase()
    .replace(PATH_SEPARATOR_PATTERN, SLUG_SEPARATOR)
    .replace(EDGE_SEPARATOR_PATTERN, EMPTY_STRING);

  if (normalizedPrefix.length === 0) return boundedHashPrefix;

  const availablePrefixBytes = maxBytes - HASH_PREFIX_HEX_LENGTH - SLUG_SEPARATOR.length;
  if (availablePrefixBytes <= 0) return boundedHashPrefix;

  const prefix = truncateNormalizedSlugPrefix(normalizedPrefix, availablePrefixBytes);
  return prefix.length === 0 ? boundedHashPrefix : `${prefix}${SLUG_SEPARATOR}${hashPrefix}`;
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

export function generateAuditRunId(randomBytes: (size: number) => Buffer): string {
  return randomBytes(RUN_ID_BYTES).toString(HEX_ENCODING);
}

export function auditBranchDir(
  gitCommonDirProductDir: string,
  validatedBranchSlug: string,
  storage: AuditStorageConfig = DEFAULT_AUDIT_CONFIG.storage,
): string {
  return join(gitCommonDirProductDir, storage.spxDir, storage.auditDir, validatedBranchSlug);
}

export function auditRunsDir(
  gitCommonDirProductDir: string,
  branchSlug: string,
  storage: AuditStorageConfig = DEFAULT_AUDIT_CONFIG.storage,
): string {
  return join(auditBranchDir(gitCommonDirProductDir, branchSlug, storage), storage.runsDir);
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

export function parseAuditRunStateContent(raw: string): AuditRunStateParseResult {
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

export function isAuditRunStateStatus(value: unknown): value is AuditRunStateStatus {
  return typeof value === "string" && Object.values(AUDIT_RUN_STATE_STATUS).includes(value as AuditRunStateStatus);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256Hex(value: string): string {
  return createHash(SHA256_ALGORITHM).update(value).digest(HEX_ENCODING);
}

function truncateNormalizedSlugPrefix(value: string, maxBytes: number): string {
  return value.slice(0, maxBytes).replace(TRAILING_SEPARATOR_PATTERN, EMPTY_STRING);
}

export function validateAuditBranchSlug(branchSlug: string): Result<string> {
  return BRANCH_SLUG_PATTERN.test(branchSlug)
    ? { ok: true, value: branchSlug }
    : { ok: false, error: AUDIT_RUN_STATE_ERROR.INVALID_BRANCH_SLUG };
}

export function isAuditRunDirectoryEntry(entry: AuditRunDirectoryEntry): boolean {
  return entry.isDirectory() && RUN_DIRECTORY_NAME_PATTERN.test(entry.name);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
