import { createHash } from "node:crypto";
import { join } from "node:path";

import type { Result } from "@/config/types";
import {
  createJsonlRunFile,
  defaultStateStoreFileSystem,
  formatRunTimestamp,
  isRunFileName,
  runFileName,
  runsDir as stateStoreRunsDir,
  STATE_STORE_ERROR,
  STATE_STORE_DOMAIN,
  type CreateRunFileOptions,
  type JsonRecord,
  type StateStoreFileEntry,
  type StateStoreFileSystem,
  type StateStoreJsonlReaderFileSystem,
  type StateStoreRunReaderFileSystem,
  worktreeScopeDir,
  writeJsonlRunRecord,
} from "@/lib/state-store";

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
  RUN_FILE_COLLISION_LIMIT: "testing run file collision limit exhausted",
  RUN_FILE_CREATE_FAILED: "testing run file create failed",
  STATE_ALREADY_EXISTS: "testing run state already exists",
  STATE_WRITE_FAILED: "testing run state write failed",
} as const;

export const TESTING_RUN_STATE_ERROR_CODE = {
  NOT_FOUND: "ENOENT",
} as const;

export const TEST_RUN_STATE_FIELDS = {
  BRANCH_NAME: "branchName",
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

export interface TestRunFile {
  readonly runsDir: string;
  readonly runFilePath: string;
  readonly runFileName: string;
  readonly runToken: string;
  readonly runId: string;
  readonly startedAt: string;
}

export interface TestTerminalRun {
  readonly runFileName: string;
  readonly runFilePath: string;
  readonly state: TestRunState;
}

export interface TestIncompleteRun {
  readonly runFileName: string;
  readonly runFilePath: string;
  readonly reason: TestingRunStateIncompleteReason;
  readonly error?: string;
}

export interface TestingRuns {
  readonly terminalRuns: readonly TestTerminalRun[];
  readonly incompleteRuns: readonly TestIncompleteRun[];
}

export type TestRunFileEntry = StateStoreFileEntry;
export type TestRunStateFileSystem = StateStoreFileSystem;
export type CreateTestRunFileOptions = CreateRunFileOptions;

export interface WriteTestRunStateOptions {
  readonly fs?: StateStoreFileSystem;
}

export interface ReadTestRunStateOptions {
  readonly fs?: StateStoreRunReaderFileSystem;
}

const SHA256_ALGORITHM = "sha256";
const HEX_ENCODING = "hex";
const SEGMENT_SEPARATOR = "-";
const JSONL_LINE_SEPARATOR = "\n";
const EMPTY_STRING = "";

const defaultFileSystem: StateStoreFileSystem = defaultStateStoreFileSystem;

export { defaultFileSystem as defaultTestRunStateFileSystem };

export function formatTestRunTimestamp(date: Date): string {
  return formatRunTimestamp(date);
}

export function testingRunsDir(productDir: string): string {
  const worktreeScope = worktreeScopeDir(productDir);
  if (!worktreeScope.ok) throw new Error(worktreeScope.error);
  const result = stateStoreRunsDir(worktreeScope.value, STATE_STORE_DOMAIN.TEST);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export async function createTestRunFile(
  productDir: string,
  options: CreateTestRunFileOptions = {},
): Promise<Result<TestRunFile>> {
  const worktreeScope = worktreeScopeDir(productDir);
  if (!worktreeScope.ok) return worktreeScope;
  const created = await createJsonlRunFile(worktreeScope.value, STATE_STORE_DOMAIN.TEST, options);
  if (!created.ok) return {
    ok: false,
    error: created.error
      .replace(STATE_STORE_ERROR.RUN_FILE_CREATE_FAILED, TESTING_RUN_STATE_ERROR.RUN_FILE_CREATE_FAILED)
      .replace(STATE_STORE_ERROR.RUN_FILE_COLLISION_LIMIT, TESTING_RUN_STATE_ERROR.RUN_FILE_COLLISION_LIMIT),
  };
  return { ok: true, value: created.value };
}

export async function writeTerminalTestRunState(
  runFilePath: string,
  state: TestRunState,
  options: WriteTestRunStateOptions = {},
): Promise<Result<string>> {
  const written = await writeJsonlRunRecord(runFilePath, testRunStateRecord(state), options);
  if (written.ok) return written;
  if (written.error === STATE_STORE_ERROR.RECORD_ALREADY_EXISTS) {
    return { ok: false, error: TESTING_RUN_STATE_ERROR.STATE_ALREADY_EXISTS };
  }
  return {
    ok: false,
    error: written.error.replace(STATE_STORE_ERROR.RECORD_WRITE_FAILED, TESTING_RUN_STATE_ERROR.STATE_WRITE_FAILED),
  };
}

export async function readTestingRuns(
  productDir: string,
  options: ReadTestRunStateOptions = {},
): Promise<Result<TestingRuns>> {
  const fs = options.fs ?? defaultFileSystem;
  const runsDir = testingRunsDir(productDir);

  let entries: readonly TestRunFileEntry[];
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, TESTING_RUN_STATE_ERROR_CODE.NOT_FOUND)) {
      return { ok: true, value: { terminalRuns: [], incompleteRuns: [] } };
    }
    return { ok: false, error: toErrorMessage(error) };
  }

  const terminalRuns: TestTerminalRun[] = [];
  const incompleteRuns: TestIncompleteRun[] = [];
  for (const entry of entries.filter(isTestRunFileEntry)) {
    const runFilePath = join(runsDir, entry.name);
    const stateResult = await readTestRunStatePath(runFilePath, fs);
    if (stateResult.ok) {
      terminalRuns.push({ runFileName: entry.name, runFilePath, state: stateResult.value });
    } else {
      incompleteRuns.push({
        runFileName: entry.name,
        runFilePath,
        reason: stateResult.reason,
        ...(stateResult.error === undefined ? {} : { error: stateResult.error }),
      });
    }
  }

  return { ok: true, value: { terminalRuns, incompleteRuns } };
}

export function selectLatestTerminalTestRunForNode(
  runs: readonly TestTerminalRun[],
  nodeTestPaths: readonly string[],
): TestTerminalRun | undefined {
  return runs
    .filter((run) => runCoversNode(run, nodeTestPaths))
    .reduce<TestTerminalRun | undefined>((latest, candidate) => {
      if (latest === undefined) return candidate;
      return compareTerminalRuns(latest, candidate) < 0 ? candidate : latest;
    }, undefined);
}

function runCoversNode(run: TestTerminalRun, nodeTestPaths: readonly string[]): boolean {
  return outcomesCoverPaths(run.state.runnerOutcomes, nodeTestPaths);
}

export function outcomesCoverPaths(
  outcomes: readonly TestRunnerOutcome[],
  nodeTestPaths: readonly string[],
): boolean {
  if (nodeTestPaths.length === 0) return false;
  const executed = new Set(outcomes.flatMap((outcome) => outcome.testPaths));
  return nodeTestPaths.every((path) => executed.has(path));
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

export function testRunFileName(runToken: string): string {
  return runFileName(runToken);
}

function testRunStateRecord(state: TestRunState): JsonRecord {
  return {
    branchName: state.branchName,
    headSha: state.headSha,
    testingConfigDigest: state.testingConfigDigest,
    runnerOutcomes: state.runnerOutcomes.map((outcome) => ({
      runnerId: outcome.runnerId,
      testPaths: outcome.testPaths,
      exitCode: outcome.exitCode,
    })),
    discoveredTestPathsDigest: state.discoveredTestPathsDigest,
    discoveredTestContentDigest: state.discoveredTestContentDigest,
    productInputDigests: state.productInputDigests.map((digest) => ({
      descriptorId: digest.descriptorId,
      digest: digest.digest,
    })),
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    status: state.status,
  };
}

type ReadStateResult =
  | { readonly ok: true; readonly value: TestRunState }
  | { readonly ok: false; readonly reason: TestingRunStateIncompleteReason; readonly error?: string };

async function readTestRunStatePath(
  runFilePath: string,
  fs: StateStoreJsonlReaderFileSystem,
): Promise<ReadStateResult> {
  let content: string;
  try {
    content = await fs.readFile(runFilePath, "utf8");
  } catch (error) {
    return {
      ok: false,
      reason: hasErrorCode(error, TESTING_RUN_STATE_ERROR_CODE.NOT_FOUND)
        ? TESTING_RUN_STATE_INCOMPLETE_REASON.MISSING_STATE
        : TESTING_RUN_STATE_INCOMPLETE_REASON.IO_ERROR,
      error: toErrorMessage(error),
    };
  }

  const latest = latestNonEmptyLine(content);
  if (latest === undefined) {
    return { ok: false, reason: TESTING_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(latest) as unknown;
  } catch {
    return { ok: false, reason: TESTING_RUN_STATE_INCOMPLETE_REASON.PARSE_INVALID_STATE };
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
  return Array.isArray(raw) && raw.every((entry) => typeof entry === "string" && entry.length > 0)
    ? { ok: true, value: raw }
    : { ok: false, error: `${field} must be an array of non-empty strings` };
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
  return compareAsciiStrings(left.runFileName, right.runFileName);
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
    .sort((left, right) => compareAsciiStrings(left.join(SEGMENT_SEPARATOR), right.join(SEGMENT_SEPARATOR)));
  return JSON.stringify(normalized);
}

function compareAsciiStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isTestRunFileEntry(entry: TestRunFileEntry): boolean {
  return entry.isFile() && isRunFileName(entry.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function latestNonEmptyLine(content: string): string | undefined {
  const lines = content.split(JSONL_LINE_SEPARATOR);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim() ?? EMPTY_STRING;
    if (line.length > 0) return line;
  }
  return undefined;
}

function sha256Hex(value: string): string {
  return createHash(SHA256_ALGORITHM).update(value).digest(HEX_ENCODING);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
