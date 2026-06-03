import { join } from "node:path";

import { digestDescriptorSection } from "@/config/descriptor-digest";
import { resolveConfig } from "@/config/index";
import { SUCCESS_EXIT_CODE } from "@/domains/testing";
import { getCurrentBranch, getHeadSha, type GitDependencies } from "@/git/root";
import { TESTING_SECTION, type TestingConfig, testingConfigDescriptor } from "@/testing/config";
import type { TestingLanguageDescriptor, TestRunnerDependencies } from "@/testing/languages/types";
import type { TestingRegistry } from "@/testing/registry";
import {
  createTestRunDirectory,
  defaultTestRunStateFileSystem,
  digestTestContents,
  digestTestPaths,
  formatTestRunTimestamp,
  type ProductInputDigest,
  type StalenessInputs,
  TEST_RUN_STATE_STATUS,
  type TestContentEntry,
  type TestRunDirectory,
  type TestRunnerOutcome,
  type TestRunState,
  type TestRunStateFileSystem,
  type TestRunStateStatus,
  writeTerminalTestRunState,
} from "@/testing/run-state";

import { runTests, type TestDispatchResult } from "./dispatch";

// Non-empty sentinel for branch/head-SHA when git resolution returns null (no
// repo, detached HEAD, or no commits) — the recorded state's identity fields must
// satisfy the non-empty-string contract `readTestingRuns` enforces on read.
export const NO_GIT_IDENTITY = "(unknown)";
const TEXT_ENCODING = "utf8";
// Descriptor-declared product inputs are not declared by any testing descriptor
// yet, so no product-input digest participates in recorded staleness; the field is
// populated once the domain-execution descriptor surface lands.
const NO_PRODUCT_INPUT_DIGESTS: readonly ProductInputDigest[] = [];

/** Shared command dependencies; filesystem, clock, and git default to real access. */
export interface TestCommandDependencies {
  readonly registry: TestingRegistry;
  readonly runnerDepsFor: (language: TestingLanguageDescriptor) => TestRunnerDependencies;
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
}

export interface RecordedTestRun {
  readonly dispatch: TestDispatchResult;
  readonly recorded: TestRunState;
}

export interface RunNodeCommandOptions {
  readonly productDir: string;
  /** Full product-root path of the node whose tests run, e.g. `spx/41-testing.enabler`. */
  readonly nodePath: string;
}

// Recording dependencies with real-access defaults applied; the seams the ADR
// requires injectable (filesystem, clock, git) resolve here once per command.
interface RecordingDependencies {
  readonly fs: TestRunStateFileSystem;
  readonly now: () => Date;
  readonly git?: GitDependencies;
}

function resolveRecordingDependencies(deps: TestCommandDependencies): RecordingDependencies {
  return {
    fs: deps.fs ?? defaultTestRunStateFileSystem,
    now: deps.now ?? (() => new Date()),
    git: deps.git,
  };
}

// Resolves the testing config and its canonical digest, the staleness input that
// detects testing-policy changes. Throws with context on a malformed config.
async function resolveTestingConfig(productDir: string): Promise<{ config: TestingConfig; digest: string }> {
  const loaded = await resolveConfig(productDir, [testingConfigDescriptor]);
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

// The files this run covered — the union of the dispatched runners' test paths.
// Recording digests this set, so a per-node run covers only its node's files and a
// full run covers every dispatched file.
function coveredTestPaths(dispatch: TestDispatchResult): readonly string[] {
  return dispatch.outcomes.flatMap((outcome) => outcome.testPaths);
}

async function readCoveredContents(
  productDir: string,
  paths: readonly string[],
  fs: TestRunStateFileSystem,
): Promise<readonly TestContentEntry[]> {
  const entries: TestContentEntry[] = [];
  for (const path of paths) {
    entries.push({ path, content: await fs.readFile(join(productDir, path), TEXT_ENCODING) });
  }
  return entries;
}

function deriveStatus(outcomes: readonly TestRunnerOutcome[]): TestRunStateStatus {
  const allPassed = outcomes.every((outcome) => outcome.exitCode === SUCCESS_EXIT_CODE);
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
  deps: { readonly fs?: TestRunStateFileSystem; readonly testingConfigDigest?: string } = {},
): Promise<StalenessInputs> {
  const fs = deps.fs ?? defaultTestRunStateFileSystem;
  // A caller that already resolved the testing config (e.g. runTestsCommand reading
  // passingScope) passes its digest so the config is read once per command; callers
  // holding no config (the per-node run, the status resolver) resolve it here.
  const testingConfigDigest = deps.testingConfigDigest ?? (await resolveTestingConfig(productDir)).digest;
  const contents = await readCoveredContents(productDir, coveredPaths, fs);
  return {
    testingConfigDigest,
    discoveredTestPathsDigest: digestTestPaths(coveredPaths),
    discoveredTestContentDigest: digestTestContents(contents),
    productInputDigests: NO_PRODUCT_INPUT_DIGESTS,
  };
}

// The single recording path both the full run and the per-node run pass through:
// assemble a TestRunState from the run's outcomes, the staleness digests over the
// covered set, and the git identity, then persist it into the reserved directory.
async function recordRun(
  directory: TestRunDirectory,
  productDir: string,
  dispatch: TestDispatchResult,
  recording: RecordingDependencies,
  testingConfigDigest?: string,
): Promise<TestRunState> {
  const staleness = await currentStalenessInputs(productDir, coveredTestPaths(dispatch), {
    fs: recording.fs,
    testingConfigDigest,
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
    startedAt: directory.startedAt,
    completedAt: formatTestRunTimestamp(recording.now()),
    status: deriveStatus(dispatch.outcomes),
  };

  const written = await writeTerminalTestRunState(directory.runDir, state, { fs: recording.fs });
  if (!written.ok) {
    throw new Error(`failed to record test run: ${written.error}`);
  }
  return state;
}

async function reserveRunDirectory(
  productDir: string,
  recording: RecordingDependencies,
): Promise<TestRunDirectory> {
  const directory = await createTestRunDirectory(productDir, { fs: recording.fs, now: recording.now });
  if (!directory.ok) {
    throw new Error(`failed to create test run directory: ${directory.error}`);
  }
  return directory.value;
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
  const { config, digest } = await resolveTestingConfig(options.productDir);
  const passingScope = options.passing ? config.passingScope : undefined;
  const recording = resolveRecordingDependencies(deps);
  const directory = await reserveRunDirectory(options.productDir, recording);
  const dispatch = await runTests(
    { productDir: options.productDir, registry: deps.registry, passingScope },
    { runnerDepsFor: deps.runnerDepsFor },
  );
  const recorded = await recordRun(directory, options.productDir, dispatch, recording, digest);
  return { dispatch, recorded };
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
  const directory = await reserveRunDirectory(options.productDir, recording);
  const dispatch = await runTests(
    { productDir: options.productDir, registry: deps.registry, passingScope: { include: [options.nodePath] } },
    { runnerDepsFor: deps.runnerDepsFor },
  );
  const recorded = await recordRun(directory, options.productDir, dispatch, recording);
  return { dispatch, recorded };
}
