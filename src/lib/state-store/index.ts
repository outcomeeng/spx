import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import {
  appendFile as nodeAppendFile,
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  readdir as nodeReaddir,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Result } from "@/config/types";
import {
  detectGitCommonDirProductRoot,
  detectWorktreeProductRoot,
  type GitDependencies,
} from "@/git/root";

export const STATE_STORE_PATH = {
  SPX_DIR: ".spx",
  BRANCH_SCOPE: "branch",
  WORKTREE_SCOPE: "worktree",
  RUNS_DIR: "runs",
  RUN_FILE_PREFIX: "run-",
  JSONL_EXTENSION: ".jsonl",
} as const;

export const STATE_STORE_DOMAIN = {
  AUDIT: "audit",
  COMPACT: "compact",
  REVIEW: "review",
  TEST: "test",
} as const;

export const STATE_STORE_ERROR = {
  INVALID_TOKEN: "state-store token must be a safe path segment",
  INVALID_BRANCH_SLUG: "state-store branch slug must be normalized before storage",
  RUN_FILE_CREATE_FAILED: "state-store run file create failed",
  RUN_FILE_COLLISION_LIMIT: "state-store run file collision limit exhausted",
  RECORD_ALREADY_EXISTS: "state-store record already exists",
  RECORD_WRITE_FAILED: "state-store record write failed",
  RECORD_READ_FAILED: "state-store record read failed",
} as const;

export const STATE_STORE_BRANCH_IDENTITY = {
  DETACHED_HEAD_PREFIX: "detached",
  DETACHED_HEAD_SHA_HEX_LENGTH: 12,
} as const;

export const STATE_STORE_BRANCH_SLUG = {
  DEFAULT_MAX_BYTES: 120,
  HASH_PREFIX_HEX_LENGTH: 8,
} as const;

export const STATE_STORE_FILE_SYSTEM_METHOD = {
  READ_FILE: "readFile",
  READDIR: "readdir",
} as const;

export interface StateStoreFileEntry {
  readonly name: string;
  isFile(): boolean;
}

export interface StateStoreFileSystem {
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string, options: { readonly withFileTypes: true }): Promise<readonly StateStoreFileEntry[]>;
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

export interface JsonlReadOptions {
  readonly fs?: StateStoreJsonlReaderFileSystem;
}

export interface StateStoreRunFile {
  readonly runsDir: string;
  readonly runFilePath: string;
  readonly runFileName: string;
  readonly runToken: string;
  readonly runId: string;
  readonly startedAt: string;
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
const RUN_ID_BYTES = 6;
const RUN_FILE_CREATE_ATTEMPTS = 10;
const RUN_TIMESTAMP_SEPARATOR = "_";
const RUN_TIMESTAMP_MILLISECOND_DIGITS = 3;
const SLUG_SEPARATOR = "-";
const EMPTY_STRING = "";
const PATH_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const EDGE_SEPARATOR_PATTERN = /^-|-$/g;
const TRAILING_SEPARATOR_PATTERN = /-+$/;
const BRANCH_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_TOKEN_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[a-f0-9]{12}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const EXCLUSIVE_CREATE_FLAG = "wx";
const WRITE_EXISTING_FLAG = "r+";
const ERROR_CODE_FILE_EXISTS = "EEXIST";
const ERROR_CODE_NOT_FOUND = "ENOENT";
const JSONL_LINE_SEPARATOR = "\n";

const defaultFileSystem: StateStoreFileSystem = {
  mkdir: async (path, options) => {
    await nodeMkdir(path, options);
  },
  writeFile: nodeWriteFile,
  appendFile: nodeAppendFile,
  readFile: nodeReadFile,
  readdir: nodeReaddir,
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

export async function resolveWorktreeScopeDir(options: ResolveScopeOptions = {}): Promise<Result<string>> {
  const gitResult = await detectWorktreeProductRoot(options.cwd, options.deps);
  return worktreeScopeDir(gitResult.productDir);
}

export function branchScopeDir(productDir: string, branchSlug: string): Result<string> {
  const validated = validateBranchSlug(branchSlug);
  if (!validated.ok) return validated;
  return {
    ok: true,
    value: join(productDir, STATE_STORE_PATH.SPX_DIR, STATE_STORE_PATH.BRANCH_SCOPE, validated.value),
  };
}

export function worktreeScopeDir(productDir: string): Result<string> {
  return { ok: true, value: join(productDir, STATE_STORE_PATH.SPX_DIR, STATE_STORE_PATH.WORKTREE_SCOPE) };
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
  const milliseconds = String(date.getUTCMilliseconds()).padStart(RUN_TIMESTAMP_MILLISECOND_DIGITS, "0");

  return `${year}-${month}-${day}${RUN_TIMESTAMP_SEPARATOR}${hours}-${minutes}-${seconds}-${milliseconds}`;
}

export function generateRunId(randomBytes: (size: number) => Buffer = nodeRandomBytes): string {
  return randomBytes(RUN_ID_BYTES).toString(HEX_ENCODING);
}

export function runFileName(runToken: string): string {
  return `${STATE_STORE_PATH.RUN_FILE_PREFIX}${runToken}${STATE_STORE_PATH.JSONL_EXTENSION}`;
}

export function isRunFileName(name: string): boolean {
  return name.startsWith(STATE_STORE_PATH.RUN_FILE_PREFIX)
    && name.endsWith(STATE_STORE_PATH.JSONL_EXTENSION)
    && RUN_TOKEN_PATTERN.test(name.slice(
      STATE_STORE_PATH.RUN_FILE_PREFIX.length,
      -STATE_STORE_PATH.JSONL_EXTENSION.length,
    ));
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
  const startedAt = formatRunTimestamp(startedDate);
  const randomBytes = options.randomBytes ?? nodeRandomBytes;

  try {
    await fs.mkdir(domainRunsDir.value, { recursive: true });
  } catch (error) {
    return { ok: false, error: `${STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED}: ${toErrorMessage(error)}` };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const runId = generateRunId(randomBytes);
    const runToken = `${startedAt}${SLUG_SEPARATOR}${runId}`;
    const name = runFileName(runToken);
    const path = join(domainRunsDir.value, name);
    try {
      await fs.writeFile(path, EMPTY_STRING, { flag: EXCLUSIVE_CREATE_FLAG });
      return { ok: true, value: { runsDir: domainRunsDir.value, runFilePath: path, runFileName: name, runToken, runId, startedAt } };
    } catch (error) {
      if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) continue;
      return { ok: false, error: `${STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED}: ${toErrorMessage(error)}` };
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
    const existing = await fs.readFile(runFilePath, "utf8");
    if (existing.trim().length > 0) return { ok: false, error: STATE_STORE_ERROR.RECORD_ALREADY_EXISTS };
  } catch (error) {
    if (!hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, error: `${STATE_STORE_ERROR.RECORD_WRITE_FAILED}: ${toErrorMessage(error)}` };
    }
  }

  try {
    await fs.writeFile(runFilePath, serializeJsonlRecord(record), { flag: WRITE_EXISTING_FLAG });
    return { ok: true, value: runFilePath };
  } catch (error) {
    return { ok: false, error: `${STATE_STORE_ERROR.RECORD_WRITE_FAILED}: ${toErrorMessage(error)}` };
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
    return { ok: false, error: `${STATE_STORE_ERROR.RECORD_WRITE_FAILED}: ${toErrorMessage(error)}` };
  }
}

export async function readLatestJsonlRecord(
  filePath: string,
  options: JsonlReadOptions = {},
): Promise<Result<unknown | undefined>> {
  const fs = options.fs ?? defaultFileSystem;
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) return { ok: true, value: undefined };
    return { ok: false, error: `${STATE_STORE_ERROR.RECORD_READ_FAILED}: ${toErrorMessage(error)}` };
  }

  const lines = content.split(JSONL_LINE_SEPARATOR);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? EMPTY_STRING;
    if (line.length === 0) continue;
    try {
      return { ok: true, value: JSON.parse(line) as unknown };
    } catch {
      continue;
    }
  }

  return { ok: true, value: undefined };
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

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
