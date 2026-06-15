/**
 * Worktree-occupancy claim store — atomic claim-record I/O at
 * `.spx/worktrees/<name>.claim` and the on-demand process-liveness
 * classification, per `spx/38-worktree.enabler/32-occupancy-store.enabler` and
 * its governing occupancy-claim decision. The filesystem and the process probe
 * are injected so classification verifies over controlled inputs.
 *
 * @module domains/worktree/occupancy-store
 */

import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  rm as nodeRm,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { Result } from "@/config/types";
import { ERROR_CODE_NOT_FOUND, hasErrorCode, validateScopeToken } from "@/lib/state-store";

export const OCCUPANCY_STATUS = {
  UNCLAIMED: "unclaimed",
  OCCUPIED: "occupied",
  STALE: "stale",
} as const;

export type OccupancyStatus = (typeof OCCUPANCY_STATUS)[keyof typeof OCCUPANCY_STATUS];

export const OCCUPANCY_CLAIM = {
  FILE_EXTENSION: ".claim",
  TEMP_EXTENSION: ".tmp",
} as const;

export const OCCUPANCY_ERROR = {
  INVALID_NAME: "worktree occupancy claim name must be a safe path segment",
  CLAIM_WRITE_FAILED: "worktree occupancy claim write failed",
  CLAIM_READ_FAILED: "worktree occupancy claim read failed",
  CLAIM_REMOVE_FAILED: "worktree occupancy claim remove failed",
  CLAIM_MALFORMED: "worktree occupancy claim record is malformed",
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
  readFile(path: string, encoding: "utf8"): Promise<string>;
  rm(path: string, options?: { readonly force?: boolean }): Promise<void>;
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
  readonly fs?: OccupancyFileSystem;
}

export const defaultOccupancyFileSystem: OccupancyFileSystem = {
  mkdir: async (path, options) => {
    await nodeMkdir(path, options);
  },
  writeFile: async (path, data) => {
    await nodeWriteFile(path, data);
  },
  rename: nodeRename,
  readFile: nodeReadFile,
  rm: async (path, options) => {
    await nodeRm(path, options);
  },
};

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

/**
 * Classifies a worktree's occupancy from its claim and the process table: no
 * claim is unclaimed; a same-host claim whose process is alive with a matching
 * start time is occupied; a dead process, a different host, or a start-time
 * mismatch (a recycled pid) is stale and therefore free. The decision reads no
 * clock, so a live holder never ages out.
 */
export function classifyOccupancy(
  claim: WorktreeClaimRecord | undefined,
  probe: ProcessProbe,
): OccupancyStatus {
  if (claim === undefined) return OCCUPANCY_STATUS.UNCLAIMED;
  if (claim.host !== probe.currentHost()) return OCCUPANCY_STATUS.STALE;
  if (!probe.isAlive(claim.pid)) return OCCUPANCY_STATUS.STALE;
  if (probe.startTimeOf(claim.pid) !== claim.startedAt) return OCCUPANCY_STATUS.STALE;
  return OCCUPANCY_STATUS.OCCUPIED;
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
  options: OccupancyFsOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultOccupancyFileSystem;
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;
  const claimPath = pathResult.value;
  const tempPath = `${claimPath}${OCCUPANCY_CLAIM.TEMP_EXTENSION}`;

  try {
    await fs.mkdir(worktreesDir, { recursive: true });
    await fs.writeFile(tempPath, serializeClaim(record));
    await fs.rename(tempPath, claimPath);
    return { ok: true, value: claimPath };
  } catch (error) {
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED, toErrorMessage(error)) };
  }
}

/** Reads and parses the claim for `name`, returning `undefined` when no claim exists. */
export async function readClaim(
  worktreesDir: string,
  name: string,
  options: OccupancyFsOptions = {},
): Promise<Result<WorktreeClaimRecord | undefined>> {
  const fs = options.fs ?? defaultOccupancyFileSystem;
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;

  let content: string;
  try {
    content = await fs.readFile(pathResult.value, "utf8");
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: formatOccupancyError(OCCUPANCY_ERROR.CLAIM_READ_FAILED, toErrorMessage(error)) };
  }

  return parseClaim(content);
}

/** Removes the claim for `name`. Idempotent — a missing claim is not an error. */
export async function removeClaim(
  worktreesDir: string,
  name: string,
  options: OccupancyFsOptions = {},
): Promise<Result<void>> {
  const fs = options.fs ?? defaultOccupancyFileSystem;
  const pathResult = claimFilePath(worktreesDir, name);
  if (!pathResult.ok) return pathResult;

  try {
    await fs.rm(pathResult.value, { force: true });
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
  options: OccupancyFsOptions = {},
): Promise<Result<OccupancyStatus>> {
  const claimResult = await readClaim(worktreesDir, name, options);
  if (!claimResult.ok) return claimResult;
  return { ok: true, value: classifyOccupancy(claimResult.value, probe) };
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
  return error instanceof Error ? error.message : String(error);
}
