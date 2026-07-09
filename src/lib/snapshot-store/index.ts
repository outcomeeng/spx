import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  compareAsciiStrings,
  createJsonlRunFile,
  defaultStateStoreFileSystem,
  ERROR_CODE_NOT_FOUND,
  hasErrorCode,
  isRunFileName,
  type JsonRecord,
  readLatestJsonlRecord,
  runsDir,
  STATE_STORE_PATH,
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
 * List a scope domain's retained snapshot addresses, newest first. The run token
 * carries the capture timestamp, so descending token order resolves the latest
 * snapshot. An absent runs directory yields an empty list, not an error.
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
    .filter((entry) => entry.isFile() && isRunFileName(entry.name))
    .map((entry) => snapshotAddress(domainRunsDir.value, entry.name))
    .sort((left, right) => compareAsciiStrings(right.runToken, left.runToken));

  return { ok: true, value: addresses };
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

function snapshotAddress(domainRunsDir: string, runFileNameValue: string): SnapshotAddress {
  return {
    runToken: runTokenFromRunFileName(runFileNameValue),
    runFileName: runFileNameValue,
    runsDir: domainRunsDir,
    runFilePath: join(domainRunsDir, runFileNameValue),
  };
}

function runTokenFromRunFileName(runFileNameValue: string): string {
  return runFileNameValue.slice(
    STATE_STORE_PATH.RUN_FILE_PREFIX.length,
    runFileNameValue.length - STATE_STORE_PATH.JSONL_EXTENSION.length,
  );
}

function listError(error: unknown): string {
  const detail = error instanceof Error ? error.message : JSON.stringify(error);
  return `${SNAPSHOT_STORE_ERROR.LIST_FAILED}${ERROR_DETAIL_SEPARATOR}${detail}`;
}
