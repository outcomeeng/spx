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
import { formatAuditRunTimestamp, slugAuditBranchIdentity } from "@/domains/audit/run-state";

export const TEST_RUN_STATE_STATUS = {
  PASSED: "passed",
  FAILED: "failed",
  INTERRUPTED: "interrupted",
} as const;

export type TestRunStateStatus = (typeof TEST_RUN_STATE_STATUS)[keyof typeof TEST_RUN_STATE_STATUS];

export const TESTING_RUN_STATE_INCOMPLETE_REASON = {
  MISSING_STATE: "missing-state",
  IO_ERROR: "io-error",
  PARSE_INVALID_STATE: "parse-invalid-state",
  SHAPE_INVALID_STATE: "shape-invalid-state",
} as const;

export type TestingRunStateIncompleteReason =
  (typeof TESTING_RUN_STATE_INCOMPLETE_REASON)[keyof typeof TESTING_RUN_STATE_INCOMPLETE_REASON];

export const TESTING_RUN_STATE_ERROR = {
  RUN_DIRECTORY_COLLISION_LIMIT: "testing run directory collision limit exhausted",
  RUN_DIRECTORY_CREATE_FAILED: "testing run directory create failed",
  STATE_ALREADY_EXISTS: "testing run state already exists",
  STATE_WRITE_FAILED: "testing run state write failed",
} as const;

export const TEST_RUN_STATE_FIELDS = {
  BRANCH_NAME: "branchName",
  BRANCH_SLUG: "branchSlug",
  HEAD_SHA: "headSha",
  TESTING_CONFIG_DIGEST: "testingConfigDigest",
  RUNNER_OUTCOMES: "runnerOutcomes",
  DISCOVERED_TEST_PATHS_DIGEST: "discoveredTestPathsDigest",
  DISCOVERED_TEST_CONTENT_DIGEST: "discoveredTestContentDigest",
  PRODUCT_INPUT_DIGESTS: "productInputDigests",
  STARTED_AT: "startedAt",
  COMPLETED_AT: "completedAt",
  STATUS: "status",
} as const;

const TEST_RUNNER_OUTCOME_FIELDS = {
  RUNNER_ID: "runnerId",
  TEST_PATHS: "testPaths",
  EXIT_CODE: "exitCode",
} as const;

const PRODUCT_INPUT_DIGEST_FIELDS = {
  DESCRIPTOR_ID: "descriptorId",
  DIGEST: "digest",
} as const;

export interface TestRunnerOutcome {
  readonly runnerId: string;
  readonly testPaths: readonly string[];
  readonly exitCode: number;
}

export interface ProductInputDigest {
  readonly descriptorId: string;
  readonly digest: string;
}

export interface TestRunState {
  readonly branchName: string;
  readonly branchSlug: string;
  readonly headSha: string;
  readonly testingConfigDigest: string;
  readonly runnerOutcomes: readonly TestRunnerOutcome[];
  readonly discoveredTestPathsDigest: string;
  readonly discoveredTestContentDigest: string;
  readonly productInputDigests: readonly ProductInputDigest[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: TestRunStateStatus;
}

export interface StalenessInputs {
  readonly testingConfigDigest: string;
  readonly discoveredTestPathsDigest: string;
  readonly discoveredTestContentDigest: string;
  readonly productInputDigests: readonly ProductInputDigest[];
}

export interface TestContentEntry {
  readonly path: string;
  readonly content: string;
}

export interface TestingStorageConfig {
  readonly spxDir: string;
  readonly testingDir: string;
  readonly runsDir: string;
  readonly stateFile: string;
}

export const DEFAULT_TESTING_STORAGE: TestingStorageConfig = {
  spxDir: ".spx",
  testingDir: "testing",
  runsDir: "runs",
  stateFile: "state.json",
};

export interface TestRunDirectory {
  readonly branchDir: string;
  readonly runsDir: string;
  readonly runDir: string;
  readonly runDirectoryName: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface TestTerminalRun {
  readonly runDirectoryName: string;
  readonly runDir: string;
  readonly statePath: string;
  readonly state: TestRunState;
}

export interface TestIncompleteRun {
  readonly runDirectoryName: string;
  readonly runDir: string;
  readonly statePath: string;
  readonly reason: TestingRunStateIncompleteReason;
  readonly error?: string;
}

export interface TestingBranchRuns {
  readonly terminalRuns: readonly TestTerminalRun[];
  readonly incompleteRuns: readonly TestIncompleteRun[];
}

export interface TestRunDirectoryEntry {
  readonly name: string;
  isDirectory(): boolean;
}

export interface TestRunStateFileSystem {
  mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  writeFile(path: string, data: string, options?: { readonly flag?: string }): Promise<void>;
  rename(source: string, target: string): Promise<void>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string, options: { readonly withFileTypes: true }): Promise<readonly TestRunDirectoryEntry[]>;
}

export interface CreateTestRunDirectoryOptions {
  readonly now?: () => Date;
  readonly randomBytes?: (size: number) => Buffer;
  readonly fs?: TestRunStateFileSystem;
  readonly storage?: TestingStorageConfig;
  readonly maxAttempts?: number;
}

export interface WriteTestRunStateOptions {
  readonly randomBytes?: (size: number) => Buffer;
  readonly fs?: TestRunStateFileSystem;
  readonly storage?: TestingStorageConfig;
}

export interface ReadTestRunStateOptions {
  readonly fs?: TestRunStateFileSystem;
  readonly storage?: TestingStorageConfig;
}

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const UTF8_ENCODING = "utf8";
const RUN_ID_BYTES = 6;
const TEMP_STATE_ID_BYTES = 6;
const RUN_DIRECTORY_CREATE_ATTEMPTS = 10;
const TEMP_STATE_FILE_PREFIX = ".state";
const TEMP_STATE_FILE_SUFFIX = ".tmp";
const JSON_INDENT_SPACES = 2;
const SLUG_SEPARATOR = "-";
const EXCLUSIVE_CREATE_FLAG = "wx";
const ERROR_CODE_FILE_EXISTS = "EEXIST";
const ERROR_CODE_NOT_FOUND = "ENOENT";
const RUN_DIRECTORY_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[a-f0-9]{12}$/;

const defaultFileSystem: TestRunStateFileSystem = {
  mkdir: async (path, options) => {
    // Normalize nodeMkdir's recursive overload to the injected fs contract.
    await nodeMkdir(path, options);
  },
  writeFile: nodeWriteFile,
  rename: nodeRename,
  readFile: nodeReadFile,
  readdir: nodeReaddir,
};

// The branch slug and run-directory timestamp reuse the audit implementations so
// testing state and audit state share one slugging and run-directory convention.
export function slugTestingBranchIdentity(branchIdentity: string, maxBytes?: number): string {
  return maxBytes === undefined
    ? slugAuditBranchIdentity(branchIdentity)
    : slugAuditBranchIdentity(branchIdentity, maxBytes);
}

export function formatTestRunTimestamp(date: Date): string {
  return formatAuditRunTimestamp(date);
}

export function testingBranchDir(
  gitCommonDirProductDir: string,
  branchSlug: string,
  storage: TestingStorageConfig = DEFAULT_TESTING_STORAGE,
): string {
  return join(gitCommonDirProductDir, storage.spxDir, storage.testingDir, branchSlug);
}

export function testingRunsDir(
  gitCommonDirProductDir: string,
  branchSlug: string,
  storage: TestingStorageConfig = DEFAULT_TESTING_STORAGE,
): string {
  return join(testingBranchDir(gitCommonDirProductDir, branchSlug, storage), storage.runsDir);
}

export async function createTestRunDirectory(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: CreateTestRunDirectoryOptions = {},
): Promise<Result<TestRunDirectory>> {
  const fs = options.fs ?? defaultFileSystem;
  const storage = options.storage ?? DEFAULT_TESTING_STORAGE;
  const maxAttempts = options.maxAttempts ?? RUN_DIRECTORY_CREATE_ATTEMPTS;
  const startedDate = (options.now ?? (() => new Date()))();
  const startedAt = formatTestRunTimestamp(startedDate);
  const branchDir = testingBranchDir(gitCommonDirProductDir, branchSlug, storage);
  const runsDir = testingRunsDir(gitCommonDirProductDir, branchSlug, storage);
  const randomBytes = options.randomBytes ?? nodeRandomBytes;

  try {
    await fs.mkdir(runsDir, { recursive: true });
  } catch (error) {
    return { ok: false, error: `${TESTING_RUN_STATE_ERROR.RUN_DIRECTORY_CREATE_FAILED}: ${toErrorMessage(error)}` };
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const runId = generateHexId(RUN_ID_BYTES, randomBytes);
    const runDirectoryName = `${startedAt}${SLUG_SEPARATOR}${runId}`;
    const runDir = join(runsDir, runDirectoryName);
    try {
      await fs.mkdir(runDir);
      return { ok: true, value: { branchDir, runsDir, runDir, runDirectoryName, runId, startedAt } };
    } catch (error) {
      if (hasErrorCode(error, ERROR_CODE_FILE_EXISTS)) continue;
      return { ok: false, error: `${TESTING_RUN_STATE_ERROR.RUN_DIRECTORY_CREATE_FAILED}: ${toErrorMessage(error)}` };
    }
  }

  return { ok: false, error: TESTING_RUN_STATE_ERROR.RUN_DIRECTORY_COLLISION_LIMIT };
}

export async function writeTerminalTestRunState(
  runDir: string,
  state: TestRunState,
  options: WriteTestRunStateOptions = {},
): Promise<Result<string>> {
  const fs = options.fs ?? defaultFileSystem;
  const storage = options.storage ?? DEFAULT_TESTING_STORAGE;
  const statePath = join(runDir, storage.stateFile);

  try {
    await fs.readFile(statePath, UTF8_ENCODING);
    return { ok: false, error: TESTING_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
  } catch (error) {
    if (!hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, error: `${TESTING_RUN_STATE_ERROR.STATE_WRITE_FAILED}: ${toErrorMessage(error)}` };
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
    return { ok: false, error: `${TESTING_RUN_STATE_ERROR.STATE_WRITE_FAILED}: ${toErrorMessage(error)}` };
  }
}

export async function readTestingBranchRuns(
  gitCommonDirProductDir: string,
  branchSlug: string,
  options: ReadTestRunStateOptions = {},
): Promise<Result<TestingBranchRuns>> {
  const fs = options.fs ?? defaultFileSystem;
  const storage = options.storage ?? DEFAULT_TESTING_STORAGE;
  const runsDir = testingRunsDir(gitCommonDirProductDir, branchSlug, storage);

  let entries: readonly TestRunDirectoryEntry[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: true, value: { terminalRuns: [], incompleteRuns: [] } };
    }
    return { ok: false, error: toErrorMessage(error) };
  }

  const terminalRuns: TestTerminalRun[] = [];
  const incompleteRuns: TestIncompleteRun[] = [];
  for (const entry of entries.filter(isTestRunDirectoryEntry)) {
    const runDir = join(runsDir, entry.name);
    const statePath = join(runDir, storage.stateFile);
    const stateResult = await readTestRunStatePath(statePath, fs);
    if (stateResult.ok) {
      terminalRuns.push({ runDirectoryName: entry.name, runDir, statePath, state: stateResult.value });
    } else {
      incompleteRuns.push({
        runDirectoryName: entry.name,
        runDir,
        statePath,
        reason: stateResult.reason,
        ...(stateResult.error === undefined ? {} : { error: stateResult.error }),
      });
    }
  }

  return { ok: true, value: { terminalRuns, incompleteRuns } };
}

export function selectLatestTerminalTestRun(runs: readonly TestTerminalRun[]): TestTerminalRun | undefined {
  return runs.reduce<TestTerminalRun | undefined>((latest, candidate) => {
    if (latest === undefined) return candidate;
    return compareTerminalRuns(latest, candidate) < 0 ? candidate : latest;
  }, undefined);
}

export function digestTestPaths(paths: readonly string[]): string {
  const normalized = [...new Set(paths)].sort(compareAsciiStrings);
  return sha256Hex(JSON.stringify(normalized));
}

export function digestTestContents(entries: readonly TestContentEntry[]): string {
  const normalized = [...entries]
    .sort((left, right) => compareAsciiStrings(left.path, right.path))
    .map((entry) => [entry.path, entry.content]);
  return sha256Hex(JSON.stringify(normalized));
}

export function isStalenessMatch(recorded: StalenessInputs, current: StalenessInputs): boolean {
  return recorded.testingConfigDigest === current.testingConfigDigest
    && recorded.discoveredTestPathsDigest === current.discoveredTestPathsDigest
    && recorded.discoveredTestContentDigest === current.discoveredTestContentDigest
    && productInputDigestsEqual(recorded.productInputDigests, current.productInputDigests);
}

export function extractStalenessInputs(state: TestRunState): StalenessInputs {
  return {
    testingConfigDigest: state.testingConfigDigest,
    discoveredTestPathsDigest: state.discoveredTestPathsDigest,
    discoveredTestContentDigest: state.discoveredTestContentDigest,
    productInputDigests: state.productInputDigests,
  };
}

type ReadStateResult =
  | { readonly ok: true; readonly value: TestRunState }
  | { readonly ok: false; readonly reason: TestingRunStateIncompleteReason; readonly error?: string };

async function readTestRunStatePath(statePath: string, fs: TestRunStateFileSystem): Promise<ReadStateResult> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, UTF8_ENCODING);
  } catch (error) {
    if (hasErrorCode(error, ERROR_CODE_NOT_FOUND)) {
      return { ok: false, reason: TESTING_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE };
    }
    return { ok: false, reason: TESTING_RUN_STATE_INCOMPLETE_REASON.IO_ERROR, error: toErrorMessage(error) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    return { ok: false, reason: TESTING_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE, error: toErrorMessage(error) };
  }

  const validated = validateTestRunState(parsed);
  if (!validated.ok) {
    return { ok: false, reason: TESTING_RUN_STATE_INCOMPLETE_REASON.SHAPE_INVALID_STATE, error: validated.error };
  }
  return { ok: true, value: validated.value };
}

function validateTestRunState(value: unknown): Result<TestRunState> {
  if (!isRecord(value)) return { ok: false, error: "testing run state must be an object" };

  const branchName = readString(value, TEST_RUN_STATE_FIELDS.BRANCH_NAME);
  if (!branchName.ok) return branchName;
  const branchSlug = readString(value, TEST_RUN_STATE_FIELDS.BRANCH_SLUG);
  if (!branchSlug.ok) return branchSlug;
  const headSha = readString(value, TEST_RUN_STATE_FIELDS.HEAD_SHA);
  if (!headSha.ok) return headSha;
  const testingConfigDigest = readString(value, TEST_RUN_STATE_FIELDS.TESTING_CONFIG_DIGEST);
  if (!testingConfigDigest.ok) return testingConfigDigest;
  const runnerOutcomes = readRunnerOutcomes(value[TEST_RUN_STATE_FIELDS.RUNNER_OUTCOMES]);
  if (!runnerOutcomes.ok) return runnerOutcomes;
  const discoveredTestPathsDigest = readString(value, TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_PATHS_DIGEST);
  if (!discoveredTestPathsDigest.ok) return discoveredTestPathsDigest;
  const discoveredTestContentDigest = readString(value, TEST_RUN_STATE_FIELDS.DISCOVERED_TEST_CONTENT_DIGEST);
  if (!discoveredTestContentDigest.ok) return discoveredTestContentDigest;
  const productInputDigests = readProductInputDigests(value[TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS]);
  if (!productInputDigests.ok) return productInputDigests;
  const startedAt = readString(value, TEST_RUN_STATE_FIELDS.STARTED_AT);
  if (!startedAt.ok) return startedAt;
  const completedAt = readString(value, TEST_RUN_STATE_FIELDS.COMPLETED_AT);
  if (!completedAt.ok) return completedAt;
  const status = readStatus(value[TEST_RUN_STATE_FIELDS.STATUS]);
  if (!status.ok) return status;

  return {
    ok: true,
    value: {
      branchName: branchName.value,
      branchSlug: branchSlug.value,
      headSha: headSha.value,
      testingConfigDigest: testingConfigDigest.value,
      runnerOutcomes: runnerOutcomes.value,
      discoveredTestPathsDigest: discoveredTestPathsDigest.value,
      discoveredTestContentDigest: discoveredTestContentDigest.value,
      productInputDigests: productInputDigests.value,
      startedAt: startedAt.value,
      completedAt: completedAt.value,
      status: status.value,
    },
  };
}

function readRunnerOutcomes(raw: unknown): Result<readonly TestRunnerOutcome[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${TEST_RUN_STATE_FIELDS.RUNNER_OUTCOMES} must be an array` };
  }
  const outcomes: TestRunnerOutcome[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      return { ok: false, error: `${TEST_RUN_STATE_FIELDS.RUNNER_OUTCOMES} entries must be objects` };
    }
    const runnerId = readString(entry, TEST_RUNNER_OUTCOME_FIELDS.RUNNER_ID);
    if (!runnerId.ok) return runnerId;
    const testPaths = readStringArray(entry, TEST_RUNNER_OUTCOME_FIELDS.TEST_PATHS);
    if (!testPaths.ok) return testPaths;
    const exitCodeRaw = entry[TEST_RUNNER_OUTCOME_FIELDS.EXIT_CODE];
    if (typeof exitCodeRaw !== "number" || !Number.isInteger(exitCodeRaw)) {
      return { ok: false, error: `${TEST_RUNNER_OUTCOME_FIELDS.EXIT_CODE} must be an integer` };
    }
    outcomes.push({ runnerId: runnerId.value, testPaths: testPaths.value, exitCode: exitCodeRaw });
  }
  return { ok: true, value: outcomes };
}

function readProductInputDigests(raw: unknown): Result<readonly ProductInputDigest[]> {
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS} must be an array` };
  }
  const digests: ProductInputDigest[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) {
      return { ok: false, error: `${TEST_RUN_STATE_FIELDS.PRODUCT_INPUT_DIGESTS} entries must be objects` };
    }
    const descriptorId = readString(entry, PRODUCT_INPUT_DIGEST_FIELDS.DESCRIPTOR_ID);
    if (!descriptorId.ok) return descriptorId;
    const digest = readString(entry, PRODUCT_INPUT_DIGEST_FIELDS.DIGEST);
    if (!digest.ok) return digest;
    digests.push({ descriptorId: descriptorId.value, digest: digest.value });
  }
  return { ok: true, value: digests };
}

function readString(value: Record<string, unknown>, field: string): Result<string> {
  const raw = value[field];
  return typeof raw === "string" && raw.length > 0
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be a non-empty string` };
}

function readStringArray(value: Record<string, unknown>, field: string): Result<readonly string[]> {
  const raw = value[field];
  return Array.isArray(raw) && raw.every((entry) => typeof entry === "string")
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be an array of strings` };
}

function readStatus(raw: unknown): Result<TestRunStateStatus> {
  return isTestRunStateStatus(raw)
    ? { ok: true, value: raw }
    : { ok: false, error: `${TEST_RUN_STATE_FIELDS.STATUS} must be a terminal testing status` };
}

function isTestRunStateStatus(value: unknown): value is TestRunStateStatus {
  return typeof value === "string" && Object.values(TEST_RUN_STATE_STATUS).includes(value as TestRunStateStatus);
}

function compareTerminalRuns(left: TestTerminalRun, right: TestTerminalRun): number {
  const completed = compareAsciiStrings(left.state.completedAt, right.state.completedAt);
  if (completed !== 0) return completed;
  const started = compareAsciiStrings(left.state.startedAt, right.state.startedAt);
  if (started !== 0) return started;
  return compareAsciiStrings(left.runDirectoryName, right.runDirectoryName);
}

function productInputDigestsEqual(
  left: readonly ProductInputDigest[],
  right: readonly ProductInputDigest[],
): boolean {
  return canonicalProductInputDigests(left) === canonicalProductInputDigests(right);
}

function canonicalProductInputDigests(digests: readonly ProductInputDigest[]): string {
  const normalized = [...digests]
    .map((digest) => [digest.descriptorId, digest.digest])
    .sort((left, right) => compareAsciiStrings(left.join(SLUG_SEPARATOR), right.join(SLUG_SEPARATOR)));
  return JSON.stringify(normalized);
}

function compareAsciiStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isTestRunDirectoryEntry(entry: TestRunDirectoryEntry): boolean {
  return entry.isDirectory() && RUN_DIRECTORY_NAME_PATTERN.test(entry.name);
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

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
