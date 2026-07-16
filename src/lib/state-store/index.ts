import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  link as nodeLink,
  lstat as nodeLstat,
  mkdir as nodeMkdir,
  open as nodeOpen,
  readdir as nodeReaddir,
  rename as nodeRename,
  rm as nodeRm,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { Result } from "@/config/types";
import { detectGitCommonDirProductRoot, detectWorktreeProductRoot, type GitDependencies } from "@/lib/git/root";

export const STATE_STORE_SCOPE_PATH = {
  SPX_DIR: ".spx",
  BRANCH_SCOPE: "branch",
  WORKTREE_SCOPE: "worktree",
  CHANGES_SCOPE: "changes",
  SESSIONS_SCOPE: "sessions",
  WORKTREES_SCOPE: "worktrees",
} as const;

export const STATE_STORE_PATH = {
  RUNS_DIR: "runs",
  RUN_FILE_PREFIX: "run-",
  JSONL_EXTENSION: ".jsonl",
} as const;

export const STATE_STORE_DOMAIN = {
  COMPACT: "compact",
  TEST: "test",
} as const;

export const STATE_STORE_ERROR = {
  INVALID_TOKEN: "state-store token must be a safe path segment",
  INVALID_BRANCH_SLUG: "state-store branch slug must be normalized before storage",
  RUN_FILE_CREATE_FAILED: "state-store run file create failed",
  RUN_FILE_COLLISION_LIMIT: "state-store run file collision limit exhausted",
  RECORD_ALREADY_EXISTS: "state-store record already exists",
  RECORD_PUBLICATION_BLOCKED: "state-store record publication blocked",
  RECORD_WRITE_FAILED: "state-store record write failed",
  RECORD_READ_FAILED: "state-store record read failed",
} as const;

export type StateStoreErrorCode = (typeof STATE_STORE_ERROR)[keyof typeof STATE_STORE_ERROR];

export interface StateStoreErrorInfo {
  readonly code: StateStoreErrorCode;
  readonly detail?: string;
}

export const STATE_STORE_BRANCH_IDENTITY = {
  DETACHED_HEAD_PREFIX: "detached",
  DETACHED_HEAD_SHA_HEX_LENGTH: 12,
} as const;

export const STATE_STORE_BRANCH_SLUG = {
  DEFAULT_MAX_BYTES: 120,
  HASH_PREFIX_HEX_LENGTH: 8,
} as const;

export const STATE_STORE_RUN_TOKEN = {
  ID_BYTES: 6,
  TIMESTAMP_MILLISECOND_DIGITS: 3,
} as const;

export const STATE_STORE_FILE_SYSTEM_METHOD = {
  READ_FILE: "readFile",
  READDIR: "readdir",
} as const;

export interface StateStoreFileEntry {
  readonly name: string;
  isFile(): boolean;
}

export interface StateStorePathStats {
  readonly birthtimeMs: number;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

export interface StateStoreFileSystem {
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string, options: { readonly withFileTypes: true }): Promise<readonly StateStoreFileEntry[]>;
  lstat(path: string): Promise<StateStorePathStats>;
  link(existingPath: string, newPath: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  rm(path: string, options?: { readonly force?: boolean }): Promise<void>;
}

export interface ResolveScopeOptions {
  readonly cwd?: string;
  readonly deps?: GitDependencies;
}

export interface CreateRunFileOptions {
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
  readonly fs?: StateStoreFileSystem;
  readonly maxAttempts?: number;
}

export interface JsonlWriteOptions {
  readonly fs?: StateStoreFileSystem;
}

export interface AtomicJsonlWriteOptions extends JsonlWriteOptions {
  readonly randomBytes?: (size: number) => Buffer;
  readonly maxAttempts?: number;
  readonly publicationGuard?: () => Promise<boolean>;
}

export interface JsonlReadOptions {
  readonly fs?: StateStoreJsonlReaderFileSystem;
}

export interface StateStoreRunToken {
  readonly runToken: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface StateStoreRunFile extends StateStoreRunToken {
  readonly runsDir: string;
  readonly runFilePath: string;
  readonly runFileName: string;
}

export interface CreateStateStoreRunTokenOptions {
  readonly date: Date;
  readonly randomBytes?: (size: number) => Buffer;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonRecord = { readonly [key: string]: JsonValue };
export type StateStoreJsonlReaderFileSystem = Pick<
  StateStoreFileSystem,
  typeof STATE_STORE_FILE_SYSTEM_METHOD.READ_FILE
>;
export type StateStoreRunReaderFileSystem = Pick<
  StateStoreFileSystem,
  typeof STATE_STORE_FILE_SYSTEM_METHOD.READ_FILE | typeof STATE_STORE_FILE_SYSTEM_METHOD.READDIR
>;

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
export const STATE_STORE_TEXT_ENCODING = "utf8";
const RUN_FILE_CREATE_ATTEMPTS = 10;
const ATOMIC_RECORD_TEMP_CREATE_ATTEMPTS = 10;
const ATOMIC_RECORD_TEMP_ID_BYTES = 6;
const ATOMIC_RECORD_TEMP_SEPARATOR = ".";
const ATOMIC_RECORD_TEMP_SUFFIX = ".tmp";
const ATOMIC_RECORD_TEMPORARY_REMAINDER_PATTERN = /^.*\.[a-f0-9]{12}\.tmp$/;
const ATOMIC_RECORD_TEMP_COLLISION_DETAIL = "temporary file collision limit exhausted";
const RUN_TIMESTAMP_SEPARATOR = "_";
const SLUG_SEPARATOR = "-";
const EMPTY_STRING = "";
const PATH_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const EDGE_SEPARATOR_PATTERN = /^-|-$/g;
const TRAILING_SEPARATOR_PATTERN = /-+$/;
const BRANCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_TOKEN_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[a-f0-9]{12}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
export const EXCLUSIVE_CREATE_FLAG = "wx";
export const WRITE_EXISTING_FLAG = "r+";
export const ERROR_CODE_FILE_EXISTS = "EEXIST";
export const ERROR_CODE_NOT_FOUND = "ENOENT";
export const ERROR_CODE_TOO_MANY_SYMBOLIC_LINKS = "ELOOP";
const JSONL_LINE_SEPARATOR = "\n";
const ERROR_DETAIL_SEPARATOR = ": ";

const defaultFileSystem: StateStoreFileSystem = {
  mkdir: async (path, options) => {
    await nodeMkdir(path, options);
  },
  writeFile: async (path, data, options) => {
    const handle = await nodeOpen(path, noFollowWriteFlag(options?.flag));
    try {
      await handle.writeFile(data);
    } finally {
      await handle.close();
    }
  },
  appendFile: async (path, data) => {
    const handle = await nodeOpen(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_NOFOLLOW,
    );
    try {
      await handle.writeFile(data);
    } finally {
      await handle.close();
    }
  },
  readFile: async (path, encoding) => {
    const handle = await nodeOpen(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      return await handle.readFile({ encoding });
    } finally {
      await handle.close();
    }
  },
  readdir: nodeReaddir,
  lstat: nodeLstat,
  link: async (existingPath, newPath) => {
    await nodeLink(existingPath, newPath);
  },
  rename: async (from, to) => {
    await nodeRename(from, to);
  },
  rm: async (path, options) => {
    await nodeRm(path, options);
  },
};

export { defaultFileSystem as defaultStateStoreFileSystem };

export function resolveBranchIdentity(input: {
  readonly branchName?: string;
  readonly headSha: string;
}): string {
  if (input.branchName !== undefined && input.branchName.length > 0) return input.branchName;
  return `${STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_PREFIX}${SLUG_SEPARATOR}${
    input.headSha.slice(0, STATE_STORE_BRANCH_IDENTITY.DETACHED_HEAD_SHA_HEX_LENGTH).toLowerCase()
  }`;
}

export function slugBranchIdentity(
  branchIdentity: string,
  maxBytes: number = STATE_STORE_BRANCH_SLUG.DEFAULT_MAX_BYTES,
): string {
  const hashPrefix = sha256Hex(branchIdentity).slice(0, STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH);
  const boundedHashPrefix = hashPrefix.slice(0, Math.max(0, maxBytes));
  const normalizedPrefix = branchIdentity
    .toLowerCase()
    .replace(PATH_SEPARATOR_PATTERN, SLUG_SEPARATOR)
    .replace(EDGE_SEPARATOR_PATTERN, EMPTY_STRING);

  if (normalizedPrefix.length === 0) return boundedHashPrefix;

  const availablePrefixBytes = maxBytes - STATE_STORE_BRANCH_SLUG.HASH_PREFIX_HEX_LENGTH - SLUG_SEPARATOR.length;
  if (availablePrefixBytes <= 0) return boundedHashPrefix;

  const prefix = truncateNormalizedSlugPrefix(normalizedPrefix, availablePrefixBytes);
  return prefix.length === 0 ? boundedHashPrefix : `${prefix}${SLUG_SEPARATOR}${hashPrefix}`;
}

export function validateBranchSlug(branchSlug: string): Result<string> {
  return BRANCH_SLUG_PATTERN.test(branchSlug)
    ? { ok: true, value: branchSlug }
    : { ok: false, error: STATE_STORE_ERROR.INVALID_BRANCH_SLUG };
}

export function validateScopeToken(token: string): Result<string> {
  return TOKEN_PATTERN.test(token)
    ? { ok: true, value: token }
    : { ok: false, error: STATE_STORE_ERROR.INVALID_TOKEN };
}

export async function resolveBranchScopeDir(
  branchSlug: string,
  options: ResolveScopeOptions = {},
): Promise<Result<string>> {
  const gitResult = await detectGitCommonDirProductRoot(options.cwd, options.deps);
  return branchScopeDir(gitResult.productDir, branchSlug);
}

export async function resolveWorktreeScopeDir(options: ResolveScopeOptions = {}): Promise<string> {
  const gitResult = await detectWorktreeProductRoot(options.cwd, options.deps);
  return worktreeScopeDir(gitResult.productDir);
}

/** The shared `.spx/sessions` scope dir plus the non-git-repo diagnostic, if any. */
export interface ResolveSessionsScopeResult {
  readonly sessionsDir: string;
  readonly warning?: string;
}

/** The shared `.spx/changes` scope dir plus the non-git-repo diagnostic, if any. */
export interface ResolveChangesScopeResult {
  readonly changesDir: string;
  readonly warning?: string;
}

/** The shared `.spx/worktrees` scope dir plus the non-git-repo diagnostic, if any. */
export interface ResolveWorktreesScopeResult {
  readonly worktreesDir: string;
  readonly warning?: string;
}

/**
 * Resolves the shared `.spx/sessions` scope directory from the Git common-dir
 * product root so every worktree addresses the same sessions store. The result
 * is the scope directory only — its consumer composes the status subdirectories
 * on top. Surfaces the non-git-repo diagnostic when resolution falls back to cwd.
 */
export async function resolveSessionsScopeDir(
  options: ResolveScopeOptions = {},
): Promise<ResolveSessionsScopeResult> {
  const gitResult = await detectGitCommonDirProductRoot(options.cwd, options.deps);
  return {
    sessionsDir: sessionsScopeDir(gitResult.productDir),
    warning: gitResult.warning,
  };
}

export function branchScopeDir(productDir: string, branchSlug: string): Result<string> {
  const validated = validateBranchSlug(branchSlug);
  if (!validated.ok) return validated;
  return {
    ok: true,
    value: join(branchScopesDir(productDir), validated.value),
  };
}

export function branchScopesDir(productDir: string): string {
  return join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.BRANCH_SCOPE);
}

export function worktreeScopeDir(productDir: string): string {
  return join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.WORKTREE_SCOPE);
}

export function changesScopeDir(productDir: string): string {
  return join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.CHANGES_SCOPE);
}

export function sessionsScopeDir(productDir: string): string {
  return join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.SESSIONS_SCOPE);
}

/** Resolves the shared `.spx/changes` scope directory from the Git common-dir product root. */
export async function resolveChangesScopeDir(
  options: ResolveScopeOptions = {},
): Promise<ResolveChangesScopeResult> {
  const gitResult = await detectGitCommonDirProductRoot(options.cwd, options.deps);
  return {
    changesDir: changesScopeDir(gitResult.productDir),
    warning: gitResult.warning,
  };
}

/**
 * Resolves the shared `.spx/worktrees` scope directory from the Git common-dir
 * product root so every worktree of the repository addresses the same
 * worktree-occupancy claim store. Surfaces the non-git-repo diagnostic when
 * resolution falls back to cwd.
 */
export async function resolveWorktreesScopeDir(
  options: ResolveScopeOptions = {},
): Promise<ResolveWorktreesScopeResult> {
  const gitResult = await detectGitCommonDirProductRoot(options.cwd, options.deps);
  return {
    worktreesDir: worktreesScopeDir(gitResult.productDir),
    warning: gitResult.warning,
  };
}

export function worktreesScopeDir(productDir: string): string {
  return join(productDir, STATE_STORE_SCOPE_PATH.SPX_DIR, STATE_STORE_SCOPE_PATH.WORKTREES_SCOPE);
}

export function composeScopeDir(baseScopeDir: string, ...tokens: readonly string[]): Result<string> {
  const segments: string[] = [];
  for (const token of tokens) {
    const validated = validateScopeToken(token);
    if (!validated.ok) return validated;
    segments.push(validated.value);
  }
  return { ok: true, value: join(baseScopeDir, ...segments) };
}

export function domainDir(scopeDir: string, domainName: string): Result<string> {
  return composeScopeDir(scopeDir, domainName);
}

export function runsDir(scopeDir: string, domainName: string): Result<string> {
  const domain = domainDir(scopeDir, domainName);
  if (!domain.ok) return domain;
  return { ok: true, value: join(domain.value, STATE_STORE_PATH.RUNS_DIR) };
}

export function formatRunTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(
    STATE_STORE_RUN_TOKEN.TIMESTAMP_MILLISECOND_DIGITS,
    "0",
  );

  return `${year}-${month}-${day}${RUN_TIMESTAMP_SEPARATOR}${hours}-${minutes}-${seconds}-${milliseconds}`;
}

export function generateRunId(randomBytes: (size: number) => Buffer = nodeRandomBytes): string {
  return randomBytes(STATE_STORE_RUN_TOKEN.ID_BYTES).toString(HEX_ENCODING);
}

export function createStateStoreRunToken(options: CreateStateStoreRunTokenOptions): StateStoreRunToken {
  const startedAt = formatRunTimestamp(options.date);
  const runId = generateRunId(options.randomBytes);
  return { runToken: `${startedAt}${SLUG_SEPARATOR}${runId}`, runId, startedAt };
}

export function runFileName(runToken: string): string {
  return `${STATE_STORE_PATH.RUN_FILE_PREFIX}${runToken}${STATE_STORE_PATH.JSONL_EXTENSION}`;
}

/**
 * The capture-timestamp (`startedAt`) prefix of a run token — the inverse of the
 * `${startedAt}${SLUG_SEPARATOR}${runId}` composition in `createStateStoreRunToken`.
 * The run-token format is source-owned here, so consumers parse it through this
 * function rather than re-deriving the separator split.
 */
export function runTokenStartedAt(runToken: string): string {
  const separatorIndex = runToken.lastIndexOf(SLUG_SEPARATOR);
  return separatorIndex < 0 ? runToken : runToken.slice(0, separatorIndex);
}

export function isRunFileName(name: string): boolean {
  return name.startsWith(STATE_STORE_PATH.RUN_FILE_PREFIX)
    && name.endsWith(STATE_STORE_PATH.JSONL_EXTENSION)
    && RUN_TOKEN_PATTERN.test(name.slice(
      STATE_STORE_PATH.RUN_FILE_PREFIX.length,
      -STATE_STORE_PATH.JSONL_EXTENSION.length,
    ));
}

/**
 * The run token carried by a run-file name — the inverse of `runFileName`.
 * Returns `undefined` when the name is not a run file, so consumers enumerate a
 * directory and recover run tokens through one source-owned parser.
 */
export function runTokenFromRunFileName(name: string): string | undefined {
  return isRunFileName(name)
    ? name.slice(STATE_STORE_PATH.RUN_FILE_PREFIX.length, -STATE_STORE_PATH.JSONL_EXTENSION.length)
    : undefined;
}

export async function createJsonlRunFile(
  scopeDir: string,
  domainName: string,
  options: CreateRunFileOptions = {},
): Promise<Result<StateStoreRunFile>> {
  const fs = options.fs ?? defaultFileSystem;
  const domainRunsDir = runsDir(scopeDir, domainName);
  if (!domainRunsDir.ok) return domainRunsDir;
  const maxAttempts = options.maxAttempts ?? RUN_FILE_CREATE_ATTEMPTS;
  const startedDate = (options.now ?? (() => new Date()))();
  const randomBytes = options.randomBytes ?? nodeRandomBytes;

  try {
    await fs.mkdir(domainRunsDir.value, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED, toErrorMessage(error)),
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const token = createStateStoreRunToken({ date: startedDate, randomBytes });
    const name = runFileName(token.runToken);
    const path = join(domainRunsDir.value, name);
    try {
      await fs.writeFile(path, EMPTY_STRING, { flag: EXCLUSIVE_CREATE_FLAG });
      return {
        ok: true,
        value: { runsDir: domainRunsDir.value, runFilePath: path, runFileName: name, ...token },
      };
    } catch (error) {
      if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) continue;
      return {
        ok: false,
        error: formatStateStoreError(STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED, toErrorMessage(error)),
      };
    }
  }

  return { ok: false, error: STATE_STORE_ERROR.RUN_FILE_COLLISION_LIMIT };
}

export async function writeJsonlRunRecord(
  runFilePath: string,
  record: JsonRecord,
  options: JsonlWriteOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultFileSystem;
  try {
    const existing = await fs.readFile(runFilePath, STATE_STORE_TEXT_ENCODING);
    if (existing.trim().length > 0) return { ok: false, error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS };
  } catch (error) {
    if (!hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return {
        ok: false,
        error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
      };
    }
  }

  try {
    await fs.writeFile(runFilePath, serializeJsonlRecord(record), { flag: WRITE_EXISTING_FLAG });
    return { ok: true, value: runFilePath };
  } catch (error) {
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
    };
  }
}

export async function appendJsonlRecord(
  filePath: string,
  record: JsonRecord,
  options: JsonlWriteOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultFileSystem;
  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, serializeJsonlRecord(record));
    return { ok: true, value: filePath };
  } catch (error) {
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
    };
  }
}

export async function publishJsonlRecordAtomically(
  filePath: string,
  record: JsonRecord,
  options: AtomicJsonlWriteOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultFileSystem;
  const randomBytes = options.randomBytes ?? nodeRandomBytes;
  const maxAttempts = options.maxAttempts ?? ATOMIC_RECORD_TEMP_CREATE_ATTEMPTS;

  try {
    await fs.mkdir(dirname(filePath), { recursive: true });
  } catch (error) {
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
    };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const temporaryPath = atomicJsonlTemporaryPath(filePath, randomBytes);
    try {
      await fs.writeFile(temporaryPath, serializeJsonlRecord(record), { flag: EXCLUSIVE_CREATE_FLAG });
    } catch (error) {
      if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) continue;
      return {
        ok: false,
        error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
      };
    }

    const guardResult = await evaluatePublicationGuard(options.publicationGuard);
    if (!guardResult.ok) {
      await removeTemporaryFileBestEffort(fs, temporaryPath);
      return guardResult;
    }

    const published = await publishAtomicJsonlTemporaryFile(fs, temporaryPath, filePath);
    await removeTemporaryFileBestEffort(fs, temporaryPath);
    return published;
  }

  return {
    ok: false,
    error: formatStateStoreError(
      STATE_STORE_ERROR.RECORD_WRITE_FAILED,
      ATOMIC_RECORD_TEMP_COLLISION_DETAIL,
    ),
  };
}

export async function removeAtomicJsonlTemporaryFiles(
  destinationPathPrefix: string,
  options: JsonlWriteOptions = {},
): Promise<Result<number>> {
  const fs = options.fs ?? defaultFileSystem;
  const directory = dirname(destinationPathPrefix);
  const namePrefix = basename(destinationPathPrefix);
  let entries: readonly StateStoreFileEntry[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: 0 };
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
    };
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !isOwnedAtomicJsonlTemporaryName(entry.name, namePrefix)) continue;
    try {
      await fs.rm(join(directory, entry.name), { force: true });
      removed += 1;
    } catch (error) {
      return {
        ok: false,
        error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
      };
    }
  }
  return { ok: true, value: removed };
}

async function evaluatePublicationGuard(
  publicationGuard: (() => Promise<boolean>) | undefined,
): Promise<Result<undefined>> {
  if (publicationGuard === undefined) return { ok: true, value: undefined };
  try {
    return (await publicationGuard())
      ? { ok: true, value: undefined }
      : { ok: false, error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED };
  } catch (error) {
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
    };
  }
}

function isOwnedAtomicJsonlTemporaryName(name: string, namePrefix: string): boolean {
  return name.startsWith(namePrefix)
    && ATOMIC_RECORD_TEMPORARY_REMAINDER_PATTERN.test(name.slice(namePrefix.length));
}

function atomicJsonlTemporaryPath(
  filePath: string,
  randomBytes: (size: number) => Buffer,
): string {
  const token = randomBytes(ATOMIC_RECORD_TEMP_ID_BYTES).toString(HEX_ENCODING);
  return `${filePath}${ATOMIC_RECORD_TEMP_SEPARATOR}${token}${ATOMIC_RECORD_TEMP_SUFFIX}`;
}

async function publishAtomicJsonlTemporaryFile(
  fs: StateStoreFileSystem,
  temporaryPath: string,
  filePath: string,
): Promise<Result<string>> {
  try {
    await fs.link(temporaryPath, filePath);
    return { ok: true, value: filePath };
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) {
      return { ok: false, error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS };
    }
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, error: STATE_STORE_ERROR.RECORD_PUBLICATION_BLOCKED };
    }
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_WRITE_FAILED, toErrorMessage(error)),
    };
  }
}

async function removeTemporaryFileBestEffort(fs: StateStoreFileSystem, temporaryPath: string): Promise<void> {
  try {
    await fs.rm(temporaryPath, { force: true });
  } catch {
    // The destination link is committed; temporary-name cleanup cannot change its result.
  }
}

export async function readLatestJsonlRecord(
  filePath: string,
  options: JsonlReadOptions = {},
): Promise<Result<unknown | undefined>> {
  const fs = options.fs ?? defaultFileSystem;
  let content: string;
  try {
    content = await fs.readFile(filePath, STATE_STORE_TEXT_ENCODING);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return {
      ok: false,
      error: formatStateStoreError(STATE_STORE_ERROR.RECORD_READ_FAILED, toErrorMessage(error)),
    };
  }

  for (const line of nonEmptyJsonlLinesNewestFirst(content)) {
    try {
      return { ok: true, value: JSON.parse(line) as unknown };
    } catch {
      continue;
    }
  }

  return { ok: true, value: undefined };
}

export function latestNonEmptyJsonlLine(content: string): string | undefined {
  return nonEmptyJsonlLinesNewestFirst(content)[0];
}

export function compareAsciiStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * A run's recency signals: the capture-timestamp prefix of its token, the
 * filesystem creation time in milliseconds, and the run token. Ordering run
 * records by recency is source-owned here so every consumer breaks same-timestamp
 * ties by true creation time rather than the token's random suffix.
 */
export interface RunRecency {
  readonly startedAt: string;
  readonly createdAtMs: number;
  readonly runToken: string;
}

export function compareRunRecencyNewestFirst(left: RunRecency, right: RunRecency): number {
  const startedAtOrder = compareAsciiStrings(left.startedAt, right.startedAt);
  if (startedAtOrder !== 0) return -startedAtOrder;
  const createdAtOrder = left.createdAtMs - right.createdAtMs;
  return createdAtOrder === 0 ? -compareAsciiStrings(left.runToken, right.runToken) : -createdAtOrder;
}

export function compareRunRecencyOldestFirst(left: RunRecency, right: RunRecency): number {
  const startedAtOrder = compareAsciiStrings(left.startedAt, right.startedAt);
  if (startedAtOrder !== 0) return startedAtOrder;
  const createdAtOrder = left.createdAtMs - right.createdAtMs;
  return createdAtOrder === 0 ? compareAsciiStrings(left.runToken, right.runToken) : createdAtOrder;
}

export function formatStateStoreError(code: StateStoreErrorCode, detail?: string): string {
  return detail === undefined ? code : `${code}${ERROR_DETAIL_SEPARATOR}${detail}`;
}

export function parseStateStoreError(error: string): StateStoreErrorInfo | undefined {
  for (const code of Object.values(STATE_STORE_ERROR)) {
    if (error === code) return { code };
    const prefix = `${code}${ERROR_DETAIL_SEPARATOR}`;
    if (error.startsWith(prefix)) return { code, detail: error.slice(prefix.length) };
  }
  return undefined;
}

export function serializeJsonlRecord(record: JsonRecord): string {
  return `${JSON.stringify(record)}${JSONL_LINE_SEPARATOR}`;
}

export function sha256Hex(value: string): string {
  return createHash(SHA256_ALGORITHM).update(value).digest(HEX_ENCODING);
}

function truncateNormalizedSlugPrefix(normalizedPrefix: string, maxBytes: number): string {
  let prefix = normalizedPrefix.slice(0, maxBytes).replace(TRAILING_SEPARATOR_PATTERN, EMPTY_STRING);
  while (Buffer.byteLength(prefix) > maxBytes) {
    prefix = prefix.slice(0, -1).replace(TRAILING_SEPARATOR_PATTERN, EMPTY_STRING);
  }
  return prefix;
}

function nonEmptyJsonlLinesNewestFirst(content: string): string[] {
  const lines = content.split(JSONL_LINE_SEPARATOR);
  const latestLines: string[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? EMPTY_STRING;
    if (line.length > 0) latestLines.push(line);
  }
  return latestLines;
}

function noFollowWriteFlag(flag: string | undefined): number {
  if (flag === EXCLUSIVE_CREATE_FLAG) {
    return fsConstants.O_WRONLY
      | fsConstants.O_CREAT
      | fsConstants.O_EXCL
      | fsConstants.O_NOFOLLOW;
  }
  if (flag === WRITE_EXISTING_FLAG) return fsConstants.O_RDWR | fsConstants.O_NOFOLLOW;
  return fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW;
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object"
    && error !== null
    && !Array.isArray(error)
    && "code" in error
    && (error as { readonly code?: unknown }).code === code
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
