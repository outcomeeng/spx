/**
 * Worktree-occupancy claim store — atomic claim-record I/O paths at
 * `.spx/worktrees/<name>.claim` and the on-demand process-liveness
 * classification. The filesystem, random-bytes source, and process probe are injected
 * so classification and I/O sequencing verify over controlled inputs.
 *
 * @module domains/worktree/occupancy-store
 */

import { join } from "node:path";

import type { Result } from "@/config/types";
import { type RandomBytes, writeFileAtomic } from "@/lib/atomic-file-write";
import { toMessage } from "@/lib/error-message";
import { ERROR_CODE_FILE_EXISTS, ERROR_CODE_NOT_FOUND, hasErrorCode, validateScopeToken } from "@/lib/state-store";

export const OCCUPANCY_STATUS = {
  FREE: "free",
  RUNNING: "running",
} as const;

export type OccupancyStatus = (typeof OCCUPANCY_STATUS)[keyof typeof OCCUPANCY_STATUS];

export const OCCUPANCY_CLAIM = {
  FILE_EXTENSION: ".claim",
  LOCK_EXTENSION: ".lock",
  LOCK_RECOVERY_EXTENSION: ".recover",
  UNREADABLE_STARTED_AT_PREFIX: "unreadable:",
} as const;

export const OCCUPANCY_FS_TEXT_ENCODING = "utf8";

export const OCCUPANCY_ERROR = {
  INVALID_NAME: "worktree occupancy claim name must be a safe path segment",
  CLAIM_WRITE_FAILED: "worktree occupancy claim write failed",
  CLAIM_READ_FAILED: "worktree occupancy claim read failed",
  CLAIM_REMOVE_FAILED: "worktree occupancy claim remove failed",
  CLAIM_MALFORMED: "worktree occupancy claim record is malformed",
  CLAIM_HELD: "worktree occupancy claim is held by a live process",
  CLAIM_LOCK_BUSY: "worktree occupancy claim acquisition is already in progress",
  CLAIM_LOCK_FAILED: "worktree occupancy claim lock failed",
  CLAIM_UNLOCK_FAILED: "worktree occupancy claim unlock failed",
  CLAIM_RELEASE_NOT_OWNER: "worktree occupancy claim release does not own the current claim",
} as const;

export type OccupancyErrorCode = (typeof OCCUPANCY_ERROR)[keyof typeof OCCUPANCY_ERROR];

const ERROR_DETAIL_SEPARATOR = ": ";

/** The four-field claim record written to `.spx/worktrees/<name>.claim`. */
export interface WorktreeClaimRecord {
  readonly sessionId: string;
  readonly host: string;
  readonly pid: number;
  readonly startedAt: string;
}

/** Injected filesystem boundary the claim store performs all I/O through. */
export interface OccupancyFileSystem {
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  symlink(target: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;
  readFile(path: string, encoding: typeof OCCUPANCY_FS_TEXT_ENCODING): Promise<string>;
  rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void>;
}

/**
 * Injected process-table probe. `currentHost` names the host the check runs on,
 * `isAlive` reads `kill(pid, 0)`, and `startTimeOf` returns the live process's
 * start time so a recycled pid is distinguished from the original holder.
 */
export interface ProcessProbe {
  currentHost(): string;
  isAlive(pid: number): boolean;
  startTimeOf(pid: number): string | undefined;
}

export interface OccupancyFsOptions {
  readonly fs: OccupancyFileSystem;
}

export interface OccupancyWriteOptions extends OccupancyFsOptions {
  readonly randomBytes: RandomBytes;
}

export interface OccupancyMutationOptions extends OccupancyFsOptions {
  readonly operation: WorktreeClaimRecord;
}

export interface OccupancyAcquireOptions extends OccupancyWriteOptions {
  readonly operation: WorktreeClaimRecord;
}

/** The claim filename for a worktree `name` — `<name>.claim`. */
export function claimFileName(name: string): string {
  return `${name}${OCCUPANCY_CLAIM.FILE_EXTENSION}`;
}

/** Composes the `.claim` path for `name` under `worktreesDir`, rejecting unsafe names. */
export function claimFilePath(worktreesDir: string, name: string): Result<string> {
  const validated = validateScopeToken(name);
  if (!validated.ok) return { ok: false, error: OCCUPANCY_ERROR.INVALID_NAME };
  return { ok: true, value: join(worktreesDir, claimFileName(validated.value)) };
}

/** The per-claim acquisition lock path for a claim file path. */
export function claimLockPath(claimPath: string): string {
  return `${claimPath}${OCCUPANCY_CLAIM.LOCK_EXTENSION}`;
}

/** The short-lived marker serializing recovery of a stale acquisition lock. */
function claimLockRecoveryPath(lockPath: string): string {
  return `${lockPath}${OCCUPANCY_CLAIM.LOCK_RECOVERY_EXTENSION}`;
}

/** The recoverable admission-lock payload recording the claimant process. */
export function claimLockTarget(record: WorktreeClaimRecord): string {
  return serializeClaim(record);
}

/**
 * Classifies a worktree's occupancy from its claim and the process table as the
 * two-state truth `running` or `free`. A worktree is `running` only when a
 * same-host claim names a live process whose start time matches — or cannot be
 * read at all (a live holder is never reported `free` on the strength of an
 * unreadable start time, the conservative choice that keeps one agent out of
 * another live agent's worktree). Every other case is `free`: no claim, a
 * different host, a dead process, or a readable start time that differs (a
 * recycled pid). There is no third state — a dead holder's residual claim reads
 * `free`, indistinguishable from a never-claimed worktree. The decision reads no
 * clock, so a live holder never ages out.
 */
export function classifyOccupancy(
  claim: WorktreeClaimRecord | undefined,
  probe: ProcessProbe,
): OccupancyStatus {
  if (claim === undefined) return OCCUPANCY_STATUS.FREE;
  if (claim.host !== probe.currentHost()) return OCCUPANCY_STATUS.FREE;
  if (!probe.isAlive(claim.pid)) return OCCUPANCY_STATUS.FREE;
  if (claim.startedAt === unreadableStartedAt(claim.pid)) return OCCUPANCY_STATUS.RUNNING;
  const liveStartTime = probe.startTimeOf(claim.pid);
  if (liveStartTime !== undefined && liveStartTime !== claim.startedAt) return OCCUPANCY_STATUS.FREE;
  return OCCUPANCY_STATUS.RUNNING;
}

/** A source-owned claim start token for live processes whose start time cannot be read. */
export function unreadableStartedAt(pid: number): string {
  return `${OCCUPANCY_CLAIM.UNREADABLE_STARTED_AT_PREFIX}${pid}`;
}

/** Builds the process identity used only for serializing one claim mutation. */
export function createClaimOperationRecord(
  sessionId: string,
  pid: number,
  probe: ProcessProbe,
): WorktreeClaimRecord {
  return {
    sessionId,
    host: probe.currentHost(),
    pid,
    startedAt: probe.startTimeOf(pid) ?? unreadableStartedAt(pid),
  };
}

/**
 * Writes the claim atomically: the record serializes to a temp file that is
 * renamed onto the claim path, so a concurrent read observes either no claim or
 * the complete record.
 */
export async function writeClaim(
  worktreesDir: string,
  name: string,
  record: WorktreeClaimRecord,
  options: OccupancyWriteOptions,
): Promise<Result<string>> {
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;
  const claimPath = pathResult.value;

  try {
    await options.fs.mkdir(worktreesDir, { recursive: true });
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED, toErrorMessage(error)) };
  }

  return writeClaimAtPath(claimPath, record, options);
}

/**
 * Acquires a claim for `name` only when the current holder is absent or reads
 * `free`. The read-classify-write operation is serialized by a per-claim lock.
 */
export async function acquireClaim(
  worktreesDir: string,
  name: string,
  record: WorktreeClaimRecord,
  probe: ProcessProbe,
  options: OccupancyAcquireOptions,
): Promise<Result<string>> {
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;
  const claimPath = pathResult.value;

  try {
    await options.fs.mkdir(worktreesDir, { recursive: true });
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED, toErrorMessage(error)) };
  }

  const lock = await acquireClaimLock(claimLockPath(claimPath), options.operation, probe, options.fs);
  if (!lock.ok) return lock;

  let acquired: Result<string>;
  try {
    acquired = await acquireClaimWhileLocked(claimPath, record, probe, options);
  } catch (error) {
    acquired = { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED, toErrorMessage(error)) };
  }
  const released = await releaseClaimLock(claimLockPath(claimPath), options.operation, options.fs);
  if (!released.ok) return released;
  return acquired;
}

/** Reads and parses the claim for `name`, returning `undefined` when no claim exists. */
export async function readClaim(
  worktreesDir: string,
  name: string,
  options: OccupancyFsOptions,
): Promise<Result<WorktreeClaimRecord | undefined>> {
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;

  return readClaimAtPath(pathResult.value, options.fs);
}

/** Removes the claim for `name`. Idempotent — a missing claim is not an error. */
export async function removeClaim(
  worktreesDir: string,
  name: string,
  owner: WorktreeClaimRecord,
  probe: ProcessProbe,
  options: OccupancyMutationOptions,
): Promise<Result<void>> {
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;

  const claimPath = pathResult.value;
  try {
    await options.fs.mkdir(worktreesDir, { recursive: true });
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_REMOVE_FAILED, toErrorMessage(error)) };
  }

  const lock = await acquireClaimLock(claimLockPath(claimPath), options.operation, probe, options.fs);
  if (!lock.ok) return lock;

  let removed: Result<void>;
  try {
    removed = await removeClaimWhileLocked(claimPath, owner, options.fs);
  } catch (error) {
    removed = { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_REMOVE_FAILED, toErrorMessage(error)) };
  }
  const released = await releaseClaimLock(claimLockPath(claimPath), options.operation, options.fs);
  if (!released.ok) return released;
  return removed;
}

async function removeClaimWhileLocked(
  claimPath: string,
  owner: WorktreeClaimRecord,
  fs: OccupancyFileSystem,
): Promise<Result<void>> {
  const current = await readClaimAtPath(claimPath, fs);
  if (!current.ok) return current;
  if (current.value === undefined) return { ok: true, value: undefined };
  if (!sameClaimOwner(current.value, owner)) return { ok: false, error: OCCUPANCY_ERROR.CLAIM_RELEASE_NOT_OWNER };

  try {
    await fs.rm(claimPath, { force: true });
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_REMOVE_FAILED, toErrorMessage(error)) };
  }
}

/** Reads the claim for `name` and classifies its occupancy against the process probe. */
export async function readOccupancy(
  worktreesDir: string,
  name: string,
  probe: ProcessProbe,
  options: OccupancyFsOptions,
): Promise<Result<OccupancyStatus>> {
  const claimResult = await readClaim(worktreesDir, name, options);
  if (!claimResult.ok) return claimResult;
  return { ok: true, value: classifyOccupancy(claimResult.value, probe) };
}

async function acquireClaimWhileLocked(
  claimPath: string,
  record: WorktreeClaimRecord,
  probe: ProcessProbe,
  options: OccupancyWriteOptions,
): Promise<Result<string>> {
  const current = await readClaimAtPath(claimPath, options.fs);
  if (!current.ok) return current;
  if (current.value !== undefined && sameClaimOwner(current.value, record)) {
    return { ok: true, value: claimPath };
  }
  if (classifyOccupancy(current.value, probe) === OCCUPANCY_STATUS.RUNNING) {
    return { ok: false, error: OCCUPANCY_ERROR.CLAIM_HELD };
  }
  return writeClaimAtPath(claimPath, record, options);
}

async function acquireClaimLock(
  lockPath: string,
  owner: WorktreeClaimRecord,
  probe: ProcessProbe,
  fs: OccupancyFileSystem,
): Promise<Result<void>> {
  try {
    await fs.symlink(claimLockTarget(owner), lockPath);
    return { ok: true, value: undefined };
  } catch (error) {
    if (!hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) {
      return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
    }
  }

  const recovered = await recoverClaimLock(lockPath, owner, probe, fs);
  if (!recovered.ok) return recovered;
  if (recovered.value) return { ok: true, value: undefined };
  return { ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY };
}

async function releaseClaimLock(
  lockPath: string,
  owner: WorktreeClaimRecord,
  fs: OccupancyFileSystem,
): Promise<Result<void>> {
  try {
    const currentTarget = await fs.readlink(lockPath);
    if (currentTarget !== claimLockTarget(owner)) return { ok: true, value: undefined };
    const removed = await removeOwnedClaimLock(lockPath, currentTarget, fs);
    if (!removed.ok) return removed;
    return { ok: true, value: undefined };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_UNLOCK_FAILED, toErrorMessage(error)) };
  }
}

async function removeOwnedClaimLock(
  lockPath: string,
  expectedTarget: string,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  try {
    const currentTarget = await fs.readlink(lockPath);
    if (currentTarget !== expectedTarget) return { ok: true, value: false };
    await fs.rm(lockPath, { force: true, recursive: true });
    return { ok: true, value: true };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: true };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_UNLOCK_FAILED, toErrorMessage(error)) };
  }
}

async function writeClaimAtPath(
  claimPath: string,
  record: WorktreeClaimRecord,
  options: OccupancyWriteOptions,
): Promise<Result<string>> {
  try {
    await writeFileAtomic(claimPath, serializeClaim(record), options);
    return { ok: true, value: claimPath };
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED, toErrorMessage(error)) };
  }
}

async function readClaimAtPath(
  claimPath: string,
  fs: OccupancyFileSystem,
): Promise<Result<WorktreeClaimRecord | undefined>> {
  let content: string;
  try {
    content = await fs.readFile(claimPath, OCCUPANCY_FS_TEXT_ENCODING);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_READ_FAILED, toErrorMessage(error)) };
  }

  return parseClaim(content);
}

function serializeClaim(record: WorktreeClaimRecord): string {
  return JSON.stringify({
    sessionId: record.sessionId,
    host: record.host,
    pid: record.pid,
    startedAt: record.startedAt,
  });
}

function parseClaim(content: string): Result<WorktreeClaimRecord> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: OCCUPANCY_ERROR.CLAIM_MALFORMED };
  }
  if (!isWorktreeClaimRecord(parsed)) return { ok: false, error: OCCUPANCY_ERROR.CLAIM_MALFORMED };
  return { ok: true, value: parsed };
}

async function recoverClaimLock(
  lockPath: string,
  owner: WorktreeClaimRecord,
  probe: ProcessProbe,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  const recoveryPath = claimLockRecoveryPath(lockPath);
  const recoveryMarker = await acquireClaimRecoveryMarker(recoveryPath, owner, probe, fs);
  if (!recoveryMarker.ok || !recoveryMarker.value) return recoveryMarker;

  let recovered: Result<boolean>;
  try {
    const cleared = await clearRecoverableClaimLock(lockPath, probe, fs);
    if (!cleared.ok || !cleared.value) {
      recovered = cleared;
    } else {
      recovered = await publishRecoveredClaimLock(lockPath, owner, fs);
    }
  } catch (error) {
    recovered = { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
  }

  const released = await releaseClaimLock(recoveryPath, owner, fs);
  if (!released.ok) return released;
  return recovered;
}

async function acquireClaimRecoveryMarker(
  recoveryPath: string,
  owner: WorktreeClaimRecord,
  probe: ProcessProbe,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  const acquired = await writeClaimRecoveryMarker(recoveryPath, owner, fs);
  if (acquired.ok && acquired.value) return acquired;
  if (!acquired.ok) return acquired;

  const cleared = await clearRecoverableClaimLock(recoveryPath, probe, fs);
  if (!cleared.ok || !cleared.value) return cleared;
  return writeClaimRecoveryMarker(recoveryPath, owner, fs);
}

async function writeClaimRecoveryMarker(
  recoveryPath: string,
  owner: WorktreeClaimRecord,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  try {
    await fs.symlink(claimLockTarget(owner), recoveryPath);
    return { ok: true, value: true };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) return { ok: true, value: false };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
  }
}

async function publishRecoveredClaimLock(
  lockPath: string,
  owner: WorktreeClaimRecord,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  try {
    await fs.symlink(claimLockTarget(owner), lockPath);
    return { ok: true, value: true };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) return { ok: true, value: false };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
  }
}

async function clearRecoverableClaimLock(
  lockPath: string,
  probe: ProcessProbe,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  let content: string;
  try {
    content = await fs.readlink(lockPath);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: true };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
  }

  const parsed = parseClaim(content);
  if (!parsed.ok) {
    const removed = await removeRecoverableClaimLock(lockPath, content, fs);
    if (!removed.ok) return removed;
    return { ok: true, value: removed.value };
  }
  let recoverable: boolean;
  try {
    recoverable = claimLockOwnerIsRecoverable(parsed.value, probe);
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
  }
  if (!recoverable) {
    return { ok: true, value: false };
  }
  const removed = await removeRecoverableClaimLock(lockPath, content, fs);
  if (!removed.ok) return removed;
  return { ok: true, value: removed.value };
}

function claimLockOwnerIsRecoverable(owner: WorktreeClaimRecord, probe: ProcessProbe): boolean {
  if (owner.host !== probe.currentHost()) return false;
  if (!probe.isAlive(owner.pid)) return true;
  const liveStartTime = probe.startTimeOf(owner.pid);
  if (owner.startedAt === unreadableStartedAt(owner.pid)) return false;
  return liveStartTime !== undefined && liveStartTime !== owner.startedAt;
}

async function removeRecoverableClaimLock(
  lockPath: string,
  expectedTarget: string,
  fs: OccupancyFileSystem,
): Promise<Result<boolean>> {
  try {
    const currentTarget = await fs.readlink(lockPath);
    if (currentTarget !== expectedTarget) return { ok: true, value: false };
    await fs.rm(lockPath, { force: true, recursive: true });
    return { ok: true, value: true };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: true };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_LOCK_FAILED, toErrorMessage(error)) };
  }
}

function sameClaimOwner(left: WorktreeClaimRecord, right: WorktreeClaimRecord): boolean {
  return (
    left.sessionId === right.sessionId
    && left.host === right.host
    && left.pid === right.pid
    && sameClaimOwnerStartTime(left, right)
  );
}

function sameClaimOwnerStartTime(left: WorktreeClaimRecord, right: WorktreeClaimRecord): boolean {
  const unreadable = unreadableStartedAt(left.pid);
  return left.startedAt === right.startedAt || left.startedAt === unreadable || right.startedAt === unreadable;
}

function isWorktreeClaimRecord(value: unknown): value is WorktreeClaimRecord {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionId === "string"
    && typeof candidate.host === "string"
    && typeof candidate.pid === "number"
    && typeof candidate.startedAt === "string"
  );
}

function formatOccupancyError(code: OccupancyErrorCode, detail: string): string {
  return `${code}${ERROR_DETAIL_SEPARATOR}${detail}`;
}

function toErrorMessage(error: unknown): string {
  return toMessage(error);
}
