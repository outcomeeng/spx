import { join } from "node:path";

import { digestDescriptorSection } from "@/config/descriptor-digest";
import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT_ORDER,
  type ConfigFile,
  type ConfigFileReadResult,
  resolveConfig,
  resolveConfigFromReadResult,
} from "@/config/index";
import { applyPathFilter, type PathFilterConfig } from "@/config/primitives/path-filter";
import type { Config, Result } from "@/config/types";
import { normalizeTargetOperand, SUCCESS_EXIT_CODE, type TargetSelection } from "@/domains/test";
import {
  defaultGitDependencies,
  getCurrentBranch,
  getHeadSha,
  GIT_ROOT_COMMAND,
  type GitDependencies,
} from "@/lib/git/root";
import { compareAsciiStrings, hasErrorCode } from "@/lib/state-store";
import { TESTING_SECTION, type TestingConfig, testingConfigDescriptor } from "@/test/config";
import type {
  RelatedTestDependencies,
  TestingLanguageDescriptor,
  TestRunnerDependencies,
} from "@/test/languages/types";
import type { TestingRegistry } from "@/test/registry";
import {
  createTestRunFile,
  defaultTestRunStateFileSystem,
  digestTestContents,
  digestTestPaths,
  formatTestRunTimestamp,
  type ProductInputDigest,
  type StalenessInputs,
  TEST_RUN_STATE_STATUS,
  type TestContentEntry,
  TESTING_RUN_STATE_ERROR_CODE,
  type TestRunFile,
  type TestRunState,
  type TestRunStateFileSystem,
  type TestRunStateStatus,
  writeTerminalTestRunState,
} from "@/test/run-state";

import { changedPathsForDirtyWorktree } from "@/lib/git/changed-paths";
import { SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import {
  CHANGED_TEST_INDEX_PATH_PREFIX,
  CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID,
  CHANGED_TEST_PRODUCT_INPUT_PATHS,
  CHANGED_TEST_SHOW_COMMAND,
  type ChangedTestSelection,
  isStagedSnapshotMissing,
  planChangedTestSelection,
} from "./changed-set-planning";
import { runTests, type TestDispatchResult } from "./dispatch";

// Non-empty sentinel for branch/head-SHA when git resolution returns null (no
// repo, detached HEAD, or no commits) — the recorded state's identity fields must
// satisfy the non-empty-string contract `readTestingRuns` enforces on read.
export const NO_GIT_IDENTITY = "(unknown)";
const TEXT_ENCODING = "utf8";
const PRODUCT_INPUT_FIELDS = {
  PATH: "path",
  PRESENT: "present",
  CONTENT: "content",
} as const;
const SPEC_TREE_ROOT_OPERAND = SPEC_TREE_CONFIG.ROOT_DIRECTORY;
const PATH_SEPARATOR = "/";
const SPEC_TREE_TESTS_PATH_SEGMENT = `${PATH_SEPARATOR}${SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME}${PATH_SEPARATOR}`;
const NODE_INDEX_SEPARATOR = "-";
const NODE_KIND_SEPARATOR = ".";
const MARKDOWN_FILE_EXTENSION = ".md";
export const CHANGED_TEST_RELATED_DEPS_ERROR = "spx test --changed requires related-test dependencies";
export const CHANGED_TEST_STAGED_DIRTY_WORKTREE_ERROR =
  "spx test --changed --staged requires selected staged test inputs to match the index";
export const CHANGED_TEST_STAGED_SELECTION_MISSING_ERROR =
  "staged changed test planning did not produce a changed selection";

/** Shared command dependencies; filesystem, clock, and git default to real access. */
export interface TestCommandDependencies {
  readonly registry: TestingRegistry;
  readonly runnerDepsFor: (language: TestingLanguageDescriptor) => TestRunnerDependencies;
  readonly relatedDepsFor?: (language: TestingLanguageDescriptor) => RelatedTestDependencies;
  /** Git access for branch and head-SHA identity; defaults to real git resolution. */
  readonly git?: GitDependencies;
  /** State filesystem for recording and discovered-content reads; defaults to real fs. */
  readonly fs?: TestRunStateFileSystem;
  /** Clock for run timestamps; defaults to the system clock. */
  readonly now?: () => Date;
}

export interface RunTestsCommandOptions {
  readonly productDir: string;
  /** True for `spx test passing` — apply the configured passing scope before dispatch. */
  readonly passing: boolean;
  /** When present with operands, only the operand-selected files dispatch; passing scope still applies. */
  readonly targets?: TargetSelection;
  /** When present, resolve changed paths to a targeted-execution operand source before dispatch. */
  readonly changed?: { readonly baseRef?: string; readonly staged?: boolean };
}

export interface RecordedTestRun {
  readonly dispatch: TestDispatchResult;
  readonly runFile: TestRunFile;
  readonly recorded: TestRunState;
}

export interface RunNodeCommandOptions {
  readonly productDir: string;
  /** Full product-root path of the node whose tests run, e.g. `spx/41-test.enabler`. */
  readonly nodePath: string;
}

// Recording dependencies with real-access defaults applied; the injectable
// filesystem, clock, and git access resolve here once per command.
interface RecordingDependencies {
  readonly fs: TestRunStateFileSystem;
  readonly now: () => Date;
  readonly git?: GitDependencies;
}

type FileReadResult =
  | { readonly present: true; readonly content: string }
  | { readonly present: false };

type SnapshotFileReader = (path: string) => Promise<FileReadResult>;

function resolveRecordingDependencies(deps: TestCommandDependencies): RecordingDependencies {
  return {
    fs: deps.fs ?? defaultTestRunStateFileSystem,
    now: deps.now ?? (() => new Date()),
    git: deps.git,
  };
}

function mergeTargetSelections(
  explicit: TargetSelection | undefined,
  changed: TargetSelection | undefined,
): TargetSelection | undefined {
  if (explicit === undefined) return changed;
  if (changed === undefined) return explicit;
  return {
    operands: [...new Set([...explicit.operands, ...changed.operands])].sort(compareAsciiStrings),
    recursive: explicit.recursive || changed.recursive,
  };
}

// Resolves the testing config and its canonical digest, the staleness input that
// detects testing-policy changes. Throws with context on a malformed config.
async function resolveTestingConfig(productDir: string): Promise<{ config: TestingConfig; digest: string }> {
  const loaded = await resolveConfig(productDir, [testingConfigDescriptor]);
  return resolvedTestingConfig(loaded);
}

async function resolveStagedTestingConfig(
  productDir: string,
  git: GitDependencies,
): Promise<{ config: TestingConfig; digest: string }> {
  const loaded = resolveConfigFromReadResult(
    await readStagedConfigFile(productDir, git),
    [testingConfigDescriptor],
  );
  return resolvedTestingConfig(loaded);
}

function resolvedTestingConfig(loaded: Result<Config>): { config: TestingConfig; digest: string } {
  if (!loaded.ok) {
    throw new Error(`failed to resolve testing config: ${loaded.error}`);
  }
  const config = loaded.value[TESTING_SECTION] as TestingConfig;
  const digest = digestDescriptorSection(config);
  if (!digest.ok) {
    throw new Error(`failed to digest testing config: ${digest.error}`);
  }
  return { config, digest: digest.value.sha256 };
}

async function readStagedConfigFile(productDir: string, git: GitDependencies): Promise<ConfigFileReadResult> {
  const detected: ConfigFile[] = [];
  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    const definition = CONFIG_FILE_DEFINITIONS[format];
    const result = await git.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [CHANGED_TEST_SHOW_COMMAND, `${CHANGED_TEST_INDEX_PATH_PREFIX}${definition.filename}`],
      { cwd: productDir, reject: false },
    );
    if (result.exitCode !== 0) {
      if (isStagedSnapshotMissing(result.stderr)) continue;
      throw new Error(`failed to read staged testing config for ${definition.filename}: ${result.stderr}`);
    }
    detected.push({
      filename: definition.filename,
      format: definition.format,
      path: join(productDir, definition.filename),
      raw: result.stdout,
    });
  }
  if (detected.length === 0) return { kind: "absent" };
  if (detected.length > 1) {
    return {
      kind: "ambiguous",
      detected: detected.map((file) => file.filename),
    };
  }
  return { kind: "ok", file: detected[0] };
}

// The files this run covered — the union of the dispatched runners' test paths.
// Recording digests this set, so a per-node run covers only its node's files and a
// full run covers every dispatched file.
function coveredTestPaths(dispatch: TestDispatchResult): readonly string[] {
  return dispatch.outcomes.flatMap((outcome) => outcome.testPaths);
}

async function readCoveredContents(
  paths: readonly string[],
  readSnapshotFile: SnapshotFileReader,
): Promise<readonly TestContentEntry[]> {
  const entries: TestContentEntry[] = [];
  for (const path of paths) {
    const result = await readSnapshotFile(path);
    entries.push({ path, content: result.present ? result.content : "" });
  }
  return entries;
}

async function readProductInputEntries(
  paths: readonly string[],
  readSnapshotFile: SnapshotFileReader,
): Promise<readonly Record<string, string | boolean>[]> {
  const entries: Array<Record<string, string | boolean>> = [];
  for (const path of [...paths].sort(compareAsciiStrings)) {
    const result = await readSnapshotFile(path);
    if (result.present) {
      entries.push({
        [PRODUCT_INPUT_FIELDS.PATH]: path,
        [PRODUCT_INPUT_FIELDS.PRESENT]: true,
        [PRODUCT_INPUT_FIELDS.CONTENT]: result.content,
      });
    } else {
      entries.push({
        [PRODUCT_INPUT_FIELDS.PATH]: path,
        [PRODUCT_INPUT_FIELDS.PRESENT]: false,
      });
    }
  }
  return entries;
}

async function digestLanguageProductInputs(
  language: TestingLanguageDescriptor,
  coveredPaths: readonly string[],
  readSnapshotFile: SnapshotFileReader,
): Promise<string> {
  return digestProductInputs(language.name, languageProductInputPaths(language, coveredPaths), readSnapshotFile);
}

async function productInputDigests(
  registry: TestingRegistry,
  coveredPaths: readonly string[],
  readSnapshotFile: SnapshotFileReader,
): Promise<readonly ProductInputDigest[]> {
  const digests: ProductInputDigest[] = [
    {
      descriptorId: CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID,
      digest: await digestProductInputs(
        CHANGED_TEST_PRODUCT_INPUT_DESCRIPTOR_ID,
        CHANGED_TEST_PRODUCT_INPUT_PATHS,
        readSnapshotFile,
      ),
    },
  ];
  for (const language of registry.languages) {
    digests.push({
      descriptorId: language.name,
      digest: await digestLanguageProductInputs(language, coveredPaths, readSnapshotFile),
    });
  }
  return digests;
}

async function digestProductInputs(
  descriptorId: string,
  paths: readonly string[],
  readSnapshotFile: SnapshotFileReader,
): Promise<string> {
  const entries = await readProductInputEntries(paths, readSnapshotFile);
  const digest = digestDescriptorSection(entries, `${descriptorId} product inputs`);
  if (!digest.ok) {
    throw new Error(`failed to digest ${descriptorId} product inputs: ${digest.error}`);
  }
  return digest.value.sha256;
}

function worktreeSnapshotFileReader(productDir: string, fs: TestRunStateFileSystem): SnapshotFileReader {
  return async (path) => {
    try {
      return { present: true, content: await fs.readFile(join(productDir, path), TEXT_ENCODING) };
    } catch (error) {
      if (!hasErrorCode(error, TESTING_RUN_STATE_ERROR_CODE.NOT_FOUND)) throw error;
      return { present: false };
    }
  };
}

function stagedSnapshotFileReader(productDir: string, git: GitDependencies): SnapshotFileReader {
  return async (path) => {
    const result = await git.execa(
      GIT_ROOT_COMMAND.EXECUTABLE,
      [CHANGED_TEST_SHOW_COMMAND, `${CHANGED_TEST_INDEX_PATH_PREFIX}${path}`],
      { cwd: productDir, reject: false },
    );
    if (result.exitCode !== 0) {
      if (isStagedSnapshotMissing(result.stderr)) return { present: false };
      throw new Error(`failed to read staged snapshot file for test recording: ${path}: ${result.stderr}`);
    }
    return { present: true, content: result.stdout };
  };
}

async function dirtyWorktreePaths(productDir: string, git: GitDependencies): Promise<readonly string[]> {
  return await changedPathsForDirtyWorktree({ productDir, git });
}

function isSpecTreeTestPath(path: string): boolean {
  return path.startsWith(`${SPEC_TREE_ROOT_OPERAND}${PATH_SEPARATOR}`) && path.includes(SPEC_TREE_TESTS_PATH_SEGMENT);
}

function dirtyPathAffectsOperand(path: string, operand: string, recursive: boolean): boolean {
  const normalizedOperand = normalizeTargetOperand(operand);
  const normalizedPath = normalizeTargetOperand(path);
  if (normalizedOperand.length === 0) {
    return isSpecTreeTestPath(normalizedPath);
  }
  if (normalizedOperand === SPEC_TREE_ROOT_OPERAND) {
    return isSpecTreeTestPath(normalizedPath);
  }
  if (normalizedPath === normalizedOperand) {
    return true;
  }
  if (isNodeSpecPathForOperand(normalizedPath, normalizedOperand)) {
    return true;
  }
  if (normalizedPath.startsWith(`${normalizedOperand}${SPEC_TREE_TESTS_PATH_SEGMENT}`)) {
    return true;
  }
  return recursive && normalizedPath.startsWith(`${normalizedOperand}${PATH_SEPARATOR}`)
    && isSpecTreeTestPath(normalizedPath);
}

function isNodeSpecPathForOperand(path: string, operand: string): boolean {
  if (!path.startsWith(`${operand}${PATH_SEPARATOR}`)) {
    return false;
  }
  const relativePath = path.slice(operand.length + PATH_SEPARATOR.length);
  if (relativePath.includes(PATH_SEPARATOR)) {
    return false;
  }
  const nodeSegment = operand.split(PATH_SEPARATOR).at(-1);
  if (nodeSegment === undefined) {
    return false;
  }
  const slugStart = nodeSegment.indexOf(NODE_INDEX_SEPARATOR);
  if (slugStart < 0) {
    return false;
  }
  const nodeKindSeparator = nodeSegment.lastIndexOf(NODE_KIND_SEPARATOR);
  if (nodeKindSeparator <= slugStart) {
    return false;
  }
  const slug = nodeSegment.slice(slugStart + NODE_INDEX_SEPARATOR.length, nodeKindSeparator);
  return relativePath === `${slug}${MARKDOWN_FILE_EXTENSION}`;
}

function stagedRunAffectedDirtyPaths(
  dirtyPaths: readonly string[],
  changedSelection: ChangedTestSelection,
  targets: TargetSelection,
  passingScope: PathFilterConfig | undefined,
): readonly string[] {
  const changedPaths = new Set(changedSelection.changedPaths.map(normalizeTargetOperand));
  const affectedPaths = dirtyPaths.filter((path) =>
    changedPaths.has(normalizeTargetOperand(path))
    || targets.operands.some((operand) => dirtyPathAffectsOperand(path, operand, targets.recursive))
  );
  return passingScope === undefined ? affectedPaths : applyPathFilter(affectedPaths, passingScope);
}

async function requireWorktreeMatchesIndexForStagedRun(
  productDir: string,
  git: GitDependencies,
  changedSelection: ChangedTestSelection,
  targets: TargetSelection,
  passingScope: PathFilterConfig | undefined,
): Promise<void> {
  const dirtyPaths = await dirtyWorktreePaths(productDir, git);
  const affectedPaths = stagedRunAffectedDirtyPaths(dirtyPaths, changedSelection, targets, passingScope);
  if (affectedPaths.length > 0) {
    throw new Error(`${CHANGED_TEST_STAGED_DIRTY_WORKTREE_ERROR}: ${affectedPaths.join(", ")}`);
  }
}

function deriveStatus(dispatch: TestDispatchResult): TestRunStateStatus {
  const allPassed = dispatch.exitCode === SUCCESS_EXIT_CODE
    && dispatch.outcomes.every((outcome) => outcome.exitCode === SUCCESS_EXIT_CODE);
  return allPassed ? TEST_RUN_STATE_STATUS.PASSED : TEST_RUN_STATE_STATUS.FAILED;
}

/**
 * Computes the four current staleness inputs (testing config digest, discovered
 * path-set digest, discovered content digest, product-input digests) over a
 * covered set of test paths. The recording path and the status resolver's
 * freshness check share this one recipe, so a node's recorded staleness inputs
 * and the current inputs later compared against them never diverge.
 */
export async function currentStalenessInputs(
  productDir: string,
  coveredPaths: readonly string[],
  deps: {
    readonly fs?: TestRunStateFileSystem;
    readonly registry: TestingRegistry;
    readonly testingConfigDigest?: string;
    readonly snapshotFileReader?: SnapshotFileReader;
  },
): Promise<StalenessInputs> {
  const fs = deps.fs ?? defaultTestRunStateFileSystem;
  const snapshotFileReader = deps.snapshotFileReader ?? worktreeSnapshotFileReader(productDir, fs);
  // A caller that already resolved the testing config (e.g. runTestsCommand reading
  // passingScope) passes its digest so the config is read once per command; callers
  // holding no config (the per-node run, the status resolver) resolve it here.
  const testingConfigDigest = deps.testingConfigDigest ?? (await resolveTestingConfig(productDir)).digest;
  const contents = await readCoveredContents(coveredPaths, snapshotFileReader);
  return {
    testingConfigDigest,
    discoveredTestPathsDigest: digestTestPaths(coveredPaths),
    discoveredTestContentDigest: digestTestContents(contents),
    productInputDigests: await productInputDigests(deps.registry, coveredPaths, snapshotFileReader),
  };
}

function languageProductInputPaths(
  language: TestingLanguageDescriptor,
  coveredPaths: readonly string[],
): readonly string[] {
  return [
    ...new Set([
      ...language.productInputPaths,
      ...(language.coveredProductInputPaths?.(coveredPaths) ?? []),
    ]),
  ].sort(compareAsciiStrings);
}

// The single recording path both the full run and the per-node run pass through:
// assemble a TestRunState from the run's outcomes, the staleness digests over the
// covered set, and the git identity, then persist it into the reserved directory.
async function recordRun(
  runFile: TestRunFile,
  productDir: string,
  dispatch: TestDispatchResult,
  recording: RecordingDependencies,
  registry: TestingRegistry,
  testingConfigDigest?: string,
  snapshotFileReader?: SnapshotFileReader,
): Promise<TestRunState> {
  const staleness = await currentStalenessInputs(productDir, coveredTestPaths(dispatch), {
    fs: recording.fs,
    registry,
    testingConfigDigest,
    snapshotFileReader,
  });
  const branchName = (await getCurrentBranch(productDir, recording.git)) ?? NO_GIT_IDENTITY;
  const headSha = (await getHeadSha(productDir, recording.git)) ?? NO_GIT_IDENTITY;

  const state: TestRunState = {
    branchName,
    headSha,
    testingConfigDigest: staleness.testingConfigDigest,
    runnerOutcomes: dispatch.outcomes,
    discoveredTestPathsDigest: staleness.discoveredTestPathsDigest,
    discoveredTestContentDigest: staleness.discoveredTestContentDigest,
    productInputDigests: staleness.productInputDigests,
    startedAt: runFile.startedAt,
    completedAt: formatTestRunTimestamp(recording.now()),
    status: deriveStatus(dispatch),
  };

  const written = await writeTerminalTestRunState(runFile.runFilePath, state, { fs: recording.fs });
  if (!written.ok) {
    throw new Error(`failed to record test run: ${written.error}`);
  }
  return state;
}

async function reserveRunFile(
  productDir: string,
  recording: RecordingDependencies,
): Promise<TestRunFile> {
  const runFile = await createTestRunFile(productDir, { fs: recording.fs, now: recording.now });
  if (!runFile.ok) {
    throw new Error(`failed to create test run file: ${runFile.error}`);
  }
  return runFile.value;
}

/**
 * Runs the spec tree's tests — every discovered file, or only the configured
 * passing scope under `passing` — through the registry, then records last-run
 * evidence for the run. Reads the passing scope from the resolved testing config.
 */
export async function runTestsCommand(
  options: RunTestsCommandOptions,
  deps: TestCommandDependencies,
): Promise<RecordedTestRun> {
  const recording = resolveRecordingDependencies(deps);
  const relatedDepsFor = deps.relatedDepsFor;
  let changedSelection: Awaited<ReturnType<typeof planChangedTestSelection>> | undefined;
  const changedGit = deps.git ?? defaultGitDependencies;
  if (options.changed !== undefined) {
    changedSelection = await planChangedTestSelection(
      { productDir: options.productDir, baseRef: options.changed.baseRef, staged: options.changed.staged },
      {
        git: changedGit,
        registry: deps.registry,
        relatedDepsFor: (languageName) => {
          if (relatedDepsFor === undefined) {
            throw new Error(CHANGED_TEST_RELATED_DEPS_ERROR);
          }
          const language = deps.registry.languages.find((candidate) => candidate.name === languageName);
          if (language === undefined) {
            throw new Error(`failed to resolve related-test dependencies for ${languageName}`);
          }
          return relatedDepsFor(language);
        },
      },
    );
  }
  const stagedChangedRun = options.changed?.staged === true;
  let selectedTargets = mergeTargetSelections(options.targets, changedSelection?.targets);
  const { config, digest } = stagedChangedRun
    ? await resolveStagedTestingConfig(options.productDir, changedGit)
    : await resolveTestingConfig(options.productDir);
  const passingScope = options.passing ? config.passingScope : undefined;
  if (stagedChangedRun) {
    if (changedSelection === undefined) {
      throw new Error(CHANGED_TEST_STAGED_SELECTION_MISSING_ERROR);
    }
    selectedTargets = mergeTargetSelections(options.targets, changedSelection.targets) ?? changedSelection.targets;
    const dirtyTargets = mergeTargetSelections(options.targets, changedSelection.dirtyTargets)
      ?? changedSelection.dirtyTargets;
    await requireWorktreeMatchesIndexForStagedRun(
      options.productDir,
      changedGit,
      changedSelection,
      dirtyTargets,
      passingScope,
    );
  }
  const snapshotFileReader = stagedChangedRun
    ? stagedSnapshotFileReader(options.productDir, changedGit)
    : undefined;
  const runFile = await reserveRunFile(options.productDir, recording);
  const dispatch = await runTests(
    {
      productDir: options.productDir,
      registry: deps.registry,
      passingScope,
      targets: selectedTargets,
      unresolvedChangedSourceFiles: changedSelection?.fullTreeSelected === true
        ? []
        : changedSelection?.unresolvedSourceFiles,
    },
    { runnerDepsFor: deps.runnerDepsFor },
  );
  const recorded = await recordRun(
    runFile,
    options.productDir,
    dispatch,
    recording,
    deps.registry,
    digest,
    snapshotFileReader,
  );
  return { dispatch, runFile, recorded };
}

/**
 * Runs a single node's tests through the registry and records fresh last-run
 * evidence covering that node, returning the recorded state for a status
 * consumer to read its outcome.
 */
export async function runNodeCommand(
  options: RunNodeCommandOptions,
  deps: TestCommandDependencies,
): Promise<RecordedTestRun> {
  const recording = resolveRecordingDependencies(deps);
  const runFile = await reserveRunFile(options.productDir, recording);
  const dispatch = await runTests(
    { productDir: options.productDir, registry: deps.registry, passingScope: { include: [options.nodePath] } },
    { runnerDepsFor: deps.runnerDepsFor },
  );
  const recorded = await recordRun(runFile, options.productDir, dispatch, recording, deps.registry);
  return { dispatch, runFile, recorded };
}
