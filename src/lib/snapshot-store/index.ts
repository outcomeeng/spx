import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  compareRunRecencyNewestFirst,
  createJsonlRunFile,
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  type JsonRecord,
  readLatestJsonlRecord,
  type RunRecency,
  runsDir,
  runTokenFromRunFileName,
  runTokenStartedAt,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
  writeJsonlRunRecord,
} from "@/lib/state-store";

/**
 * The address of one persisted snapshot: its run token and the resolved run-file
 * path within a scope's snapshot runs directory. Multiple addresses coexist under
 * one scope — one per captured run — so no capture clobbers another.
 */
export interface SnapshotAddress {
  readonly runToken: string;
  readonly runFileName: string;
  readonly runsDir: string;
  readonly runFilePath: string;
}

export interface CaptureSnapshotOptions {
  readonly fs?: StateStoreFileSystem;
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
}

export interface SnapshotStoreReadOptions {
  readonly fs?: StateStoreFileSystem;
}

export const SNAPSHOT_STORE_ERROR = {
  LIST_FAILED: "snapshot store list failed",
} as const;

const ERROR_DETAIL_SEPARATOR = ": ";

/**
 * Reserve a fresh run address within a scope's snapshot domain and record the
 * whole document there once. The record store's exclusive-create reservation and
 * single-record write make the address immutable: a colliding address rejects
 * rather than overwriting a prior snapshot, so successive captures never clobber.
 */
export async function captureSnapshot(
  scopeDir: string,
  domainName: string,
  document: JsonRecord,
  options: CaptureSnapshotOptions = {},
): Promise<Result<SnapshotAddress>> {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const created = await createJsonlRunFile(scopeDir, domainName, {
    fs,
    now: options.now,
    randomBytes: options.randomBytes,
  });
  if (!created.ok) return created;

  const written = await writeJsonlRunRecord(created.value.runFilePath, document, { fs });
  if (!written.ok) return written;

  return {
    ok: true,
    value: {
      runToken: created.value.runToken,
      runFileName: created.value.runFileName,
      runsDir: created.value.runsDir,
      runFilePath: created.value.runFilePath,
    },
  };
}

/** Read the document persisted at a snapshot address; `undefined` when the run file holds no record. */
export async function readSnapshot(
  address: SnapshotAddress,
  options: SnapshotStoreReadOptions = {},
): Promise<Result<unknown>> {
  return readLatestJsonlRecord(address.runFilePath, { fs: options.fs ?? defaultStateStoreFileSystem });
}

/**
 * List a scope domain's retained snapshot addresses, newest first. Ordering is by
 * capture timestamp, then by filesystem creation time (`birthtimeMs`) for captures
 * that share a millisecond, then by run token — so the latest snapshot resolves by
 * true creation order even when concurrent captures land in the same millisecond,
 * where the run token's random suffix carries no ordering signal. Ordering uses the
 * source-owned `compareRunRecencyNewestFirst`. An absent runs directory yields an
 * empty list, not an error.
 */
export async function listSnapshots(
  scopeDir: string,
  domainName: string,
  options: SnapshotStoreReadOptions = {},
): Promise<Result<readonly SnapshotAddress[]>> {
  const fs = options.fs ?? defaultStateStoreFileSystem;
  const domainRunsDir = runsDir(scopeDir, domainName);
  if (!domainRunsDir.ok) return domainRunsDir;

  let entries: readonly StateStoreFileEntry[];
  try {
    entries = await fs.readdir(domainRunsDir.value, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: [] };
    return { ok: false, error: listError(error) };
  }

  const addresses = entries
    .filter((entry) => entry.isFile())
    .map((entry) => snapshotAddress(domainRunsDir.value, entry.name))
    .filter((address): address is SnapshotAddress => address !== undefined);

  try {
    return { ok: true, value: await orderSnapshotsNewestFirst(addresses, fs) };
  } catch (error) {
    return { ok: false, error: listError(error) };
  }
}

/** Read the document of the latest retained snapshot in a scope domain; `undefined` when none exists. */
export async function readLatestSnapshot(
  scopeDir: string,
  domainName: string,
  options: SnapshotStoreReadOptions = {},
): Promise<Result<unknown>> {
  const listed = await listSnapshots(scopeDir, domainName, options);
  if (!listed.ok) return listed;

  if (listed.value.length === 0) return { ok: true, value: undefined };
  return readSnapshot(listed.value[0], options);
}

interface DatedSnapshot extends RunRecency {
  readonly address: SnapshotAddress;
}

/**
 * Resolve each address's filesystem creation time through the injected filesystem
 * and order the addresses newest first. Reading `birthtimeMs` supplies the true
 * creation-order signal that the run token lacks within a single millisecond.
 */
async function orderSnapshotsNewestFirst(
  addresses: readonly SnapshotAddress[],
  fs: StateStoreFileSystem,
): Promise<readonly SnapshotAddress[]> {
  const dated = await Promise.all(
    addresses.map(async (address): Promise<DatedSnapshot> => {
      const stats = await fs.lstat(address.runFilePath);
      return {
        address,
        startedAt: runTokenStartedAt(address.runToken),
        createdAtMs: stats.birthtimeMs,
        runToken: address.runToken,
      };
    }),
  );
  return [...dated].sort(compareRunRecencyNewestFirst).map((entry) => entry.address);
}

function snapshotAddress(domainRunsDir: string, runFileNameValue: string): SnapshotAddress | undefined {
  const runToken = runTokenFromRunFileName(runFileNameValue);
  if (runToken === undefined) return undefined;
  return {
    runToken,
    runFileName: runFileNameValue,
    runsDir: domainRunsDir,
    runFilePath: join(domainRunsDir, runFileNameValue),
  };
}

function listError(error: unknown): string {
  const detail = error instanceof Error ? error.message : JSON.stringify(error);
  return `${SNAPSHOT_STORE_ERROR.LIST_FAILED}${ERROR_DETAIL_SEPARATOR}${detail}`;
}
