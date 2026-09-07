import { copyFile, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";
import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import {
  createJournalReporter,
  createVitestRunStarter,
  productVitestNodeApiLoader,
  runTestsStreaming,
  VITEST_NODE_API_ENTRY,
  VITEST_PACKAGE_NAME,
  type VitestNodeApi,
  type VitestNodeApiLoader,
  type VitestNodeApiResolution,
  type VitestRunStart,
  type VitestRunStarter,
  type VitestRunStartOptions,
} from "@/test/languages/journal-reporter";
import {
  JOURNAL_RUN_TERMINAL_STATUS,
  type JournalRunInvocation,
  type JournalRunRequest,
  type JournalRunTerminalStatus,
  type TestFinding,
  type TestRunEvidenceSink,
  type TestScopeUnit,
} from "@/test/languages/types";
import { runTestsStreaming as descriptorRunTestsStreaming } from "@/test/languages/typescript";
import { sampleGeneratedValue } from "@testing/generators/sample";
import type { GeneratedRunCase, GeneratedRunScenario } from "@testing/generators/testing/journal-reporter";
import { GENERATED_CASE_STATE, JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

/** The directory a product's installed runner toolchain resolves from. */
const PACKAGE_DEPENDENCIES_DIRECTORY = "node_modules";
/** The manifest file a product-supplied package declares its entry points in. */
const PACKAGE_MANIFEST_FILENAME = "package.json";
/** The outcome every spy run-starter reports: the run started. */
const STARTED_RUN: VitestRunStart = { started: true };

/** One recorded append against a recording evidence sink, preserving invocation order. */
export type RecordedSinkCall =
  | { readonly kind: "scope"; readonly unit: TestScopeUnit }
  | { readonly kind: "finding"; readonly finding: TestFinding };

/** A recording evidence sink: implements the reporter's port and records every append (Stage 5 exception 6: observability). */
export interface RecordingEvidenceSink extends TestRunEvidenceSink {
  readonly calls: readonly RecordedSinkCall[];
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
}

/** Builds a fresh in-memory recording evidence sink that records calls and performs no I/O. */
export function createRecordingEvidenceSink(): RecordingEvidenceSink {
  const calls: RecordedSinkCall[] = [];
  const scopes: TestScopeUnit[] = [];
  const findings: TestFinding[] = [];
  return {
    appendScope(unit: TestScopeUnit): void {
      scopes.push(unit);
      calls.push({ kind: "scope", unit });
    },
    appendFinding(finding: TestFinding): void {
      findings.push(finding);
      calls.push({ kind: "finding", finding });
    },
    get calls(): readonly RecordedSinkCall[] {
      return calls;
    },
    get scopes(): readonly TestScopeUnit[] {
      return scopes;
    },
    get findings(): readonly TestFinding[] {
      return findings;
    },
  };
}

/** An async recording evidence sink: each append records only after a macrotask, so a reporter that fails to await it has recorded nothing by the time its hook returns (Stage 5 exception 6: observability). */
export interface AsyncRecordingEvidenceSink extends TestRunEvidenceSink {
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
}

/** Builds an async recording sink whose appends land on a macrotask boundary before recording, so an awaiting reporter records them and a fire-and-forget one does not. */
export function createAsyncRecordingEvidenceSink(): AsyncRecordingEvidenceSink {
  const scopes: TestScopeUnit[] = [];
  const findings: TestFinding[] = [];
  return {
    async appendScope(unit: TestScopeUnit): Promise<void> {
      await delay(0);
      scopes.push(unit);
    },
    async appendFinding(finding: TestFinding): Promise<void> {
      await delay(0);
      findings.push(finding);
    },
    get scopes(): readonly TestScopeUnit[] {
      return scopes;
    },
    get findings(): readonly TestFinding[] {
      return findings;
    },
  };
}

/** A spy Vitest run-starter: records the options a journal-streaming run supplies without spawning Vitest. */
export interface SpyVitestRunStarter extends VitestRunStarter {
  readonly startedRuns: readonly VitestRunStartOptions[];
}

/** Builds a spy run-starter that records each `start` invocation and never spawns Vitest. */
export function createSpyVitestRunStarter(): SpyVitestRunStarter {
  const startedRuns: VitestRunStartOptions[] = [];
  return {
    start(options: VitestRunStartOptions): Promise<VitestRunStart> {
      startedRuns.push(options);
      return Promise.resolve(STARTED_RUN);
    },
    get startedRuns(): readonly VitestRunStartOptions[] {
      return startedRuns;
    },
  };
}

/**
 * Builds a run-starter that records each `start` invocation and drives every registered
 * reporter's lifecycle hooks over a generated scenario, sealing with the given reason —
 * so a journal-streaming run streams the scenario's scope and finding evidence into its
 * sink without spawning Vitest. Lets an `l1` test exercise a streaming run's full
 * scope-and-finding delivery through the injected starter seam.
 */
export function createScenarioDrivingVitestRunStarter(
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): SpyVitestRunStarter {
  const startedRuns: VitestRunStartOptions[] = [];
  return {
    async start(options: VitestRunStartOptions): Promise<VitestRunStart> {
      startedRuns.push(options);
      for (const reporter of options.reporters) {
        await driveReporterOverScenario(reporter, scenario, reason);
      }
      return STARTED_RUN;
    },
    get startedRuns(): readonly VitestRunStartOptions[] {
      return startedRuns;
    },
  };
}

/**
 * A contract Vitest Node API loader (Stage 5 exception 7, contract probe, plus exception 6,
 * observability): it resolves every product directory to a deterministic specifier derived
 * from that directory, records each `resolve` and `load` call, and loads a Node API whose
 * `startVitest` drives every registered reporter over the generated scenario and seals with
 * the given reason — so the production run-starter's resolve-then-import protocol is
 * observable at `l1` without a Vitest installation.
 */
export interface ContractVitestNodeApiLoader extends VitestNodeApiLoader {
  /** Every product directory `resolve` was asked to resolve against, in call order. */
  readonly resolvedProductDirs: readonly string[];
  /** Every specifier `load` was asked to import, in call order. */
  readonly loadedSpecifiers: readonly string[];
  /** The specifier this loader resolves a product directory to. */
  specifierFor(productDir: string): string;
}

/** The Node API entry path this contract loader derives under a product directory. */
const CONTRACT_NODE_API_ENTRY_SEGMENTS = [
  PACKAGE_DEPENDENCIES_DIRECTORY,
  VITEST_PACKAGE_NAME,
  `${VITEST_NODE_API_ENTRY}.js`,
] as const;

function reportersOf(options: Parameters<VitestNodeApi["startVitest"]>[2]): readonly Reporter[] {
  const declared = options?.reporters;
  const entries = Array.isArray(declared) ? declared : declared === undefined ? [] : [declared];
  return entries.filter((entry): entry is Reporter => typeof entry === "object" && !Array.isArray(entry));
}

function createContractVitestNodeApi(scenario: GeneratedRunScenario, reason: JournalRunTerminalStatus): VitestNodeApi {
  return {
    startVitest: async (_mode, _cliFilters, options) => {
      for (const reporter of reportersOf(options)) {
        await driveReporterOverScenario(reporter, scenario, reason);
      }
      // The starter only closes the instance after the run; a closeable stand-in is the whole
      // contract this probe honors (Stage 5: contract probe).
      return { close: () => Promise.resolve() } as unknown as Vitest;
    },
  };
}

/** Builds a contract loader over the given scenario and terminal reason. */
export function createContractVitestNodeApiLoader(
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): ContractVitestNodeApiLoader {
  const resolvedProductDirs: string[] = [];
  const loadedSpecifiers: string[] = [];
  const specifierFor = (productDir: string): string => join(productDir, ...CONTRACT_NODE_API_ENTRY_SEGMENTS);
  return {
    specifierFor,
    resolve(productDir: string): VitestNodeApiResolution {
      resolvedProductDirs.push(productDir);
      return { resolved: true, specifier: specifierFor(productDir) };
    },
    load(specifier: string): Promise<VitestNodeApi> {
      loadedSpecifiers.push(specifier);
      return Promise.resolve(createContractVitestNodeApi(scenario, reason));
    },
    get resolvedProductDirs(): readonly string[] {
      return resolvedProductDirs;
    },
    get loadedSpecifiers(): readonly string[] {
      return loadedSpecifiers;
    },
  };
}

/**
 * Asserts a fresh recording sink records the given scope and finding appends in
 * invocation order across both channels.
 */
export function assertRecordingSinkRecordsInOrder(
  scopes: readonly TestScopeUnit[],
  findings: readonly TestFinding[],
): void {
  const sink = createRecordingEvidenceSink();
  // Interleave scope and finding appends so the recorded call order exercises
  // cross-channel invocation order: a sink that grouped calls by kind rather than
  // preserving invocation order would record a different sink.calls sequence and fail.
  const expectedCalls: RecordedSinkCall[] = [];
  for (let i = 0; i < Math.max(scopes.length, findings.length); i += 1) {
    if (i < scopes.length) {
      const unit = scopes[i];
      sink.appendScope(unit);
      expectedCalls.push({ kind: "scope", unit });
    }
    if (i < findings.length) {
      const finding = findings[i];
      sink.appendFinding(finding);
      expectedCalls.push({ kind: "finding", finding });
    }
  }
  expect(sink.scopes).toEqual(scopes);
  expect(sink.findings).toEqual(findings);
  expect(sink.calls).toEqual(expectedCalls);
}

/**
 * Asserts the async recording sink defers each append past the microtask queue to a
 * macrotask boundary: a not-yet-awaited `appendScope`/`appendFinding` records nothing,
 * a microtask tick still records nothing, and only awaiting the append's promise records
 * it. This is the observable contract the reporter's await-behavior test rests on — a
 * consumer that fires the append and returns without awaiting records nothing.
 */
export async function assertAsyncSinkRecordsAfterMacrotask(
  unit: TestScopeUnit,
  finding: TestFinding,
): Promise<void> {
  const sink = createAsyncRecordingEvidenceSink();

  const scopePending = sink.appendScope(unit);
  expect(sink.scopes).toEqual([]);
  await Promise.resolve();
  expect(sink.scopes).toEqual([]);
  await scopePending;
  expect(sink.scopes).toEqual([unit]);

  const findingPending = sink.appendFinding(finding);
  expect(sink.findings).toEqual([]);
  await Promise.resolve();
  expect(sink.findings).toEqual([]);
  await findingPending;
  expect(sink.findings).toEqual([finding]);
}

// Minimal Vitest doubles carrying only the fields the reporter reads; the real
// TestModule / TestCase cannot be constructed outside a live run (Stage 5: contract probe).
function buildTestModuleDouble(moduleId: string): TestModule {
  return { moduleId } as unknown as TestModule;
}

function buildTestCaseDouble(moduleId: string, runCase: GeneratedRunCase): TestCase {
  return {
    module: { moduleId },
    fullName: runCase.testName,
    result: () => ({ state: runCase.state, errors: runCase.errors.map((message) => ({ message })) }),
  } as unknown as TestCase;
}

/** Fires a reporter's lifecycle hooks over a generated scenario in run order, awaiting each hook, sealing with the given reason. */
export async function driveReporterOverScenario(
  reporter: Reporter,
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): Promise<void> {
  const testModule = buildTestModuleDouble(scenario.moduleId);
  await reporter.onTestModuleStart?.(testModule);
  for (const runCase of scenario.cases) {
    await reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
  }
  await reporter.onTestModuleEnd?.(testModule);
  await reporter.onTestRunEnd?.([testModule], [], reason);
}

/** The findings a scenario's failing cases map to: one finding per failing case, carrying the module id, case name, and error text. */
export function expectedFindingsForScenario(scenario: GeneratedRunScenario): readonly TestFinding[] {
  return scenario.cases
    .filter((runCase) => runCase.state === GENERATED_CASE_STATE.FAILED)
    .map((runCase) => ({ moduleId: scenario.moduleId, testName: runCase.testName, errors: runCase.errors }));
}

/** Asserts the reporter maps a scenario to one module scope, a finding per failing case, none per passing case, and the run reason to its terminal status. */
export async function assertJournalReporterMapping(
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): Promise<void> {
  const sink = createRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  await driveReporterOverScenario(reporter, scenario, reason);
  expect(sink.scopes).toEqual([{ moduleId: scenario.moduleId }]);
  expect(sink.findings).toEqual(expectedFindingsForScenario(scenario));
  expect(reporter.terminalStatus).toBe(reason);
}

/**
 * Asserts the reporter appends each event as its hook fires: the module scope is
 * recorded on module start and a failing-case finding on that case's result, both
 * before run end rather than batched at the terminal event.
 */
export async function assertReporterStreamsPerHook(scenario: GeneratedRunScenario): Promise<void> {
  const sink = createRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  const testModule = buildTestModuleDouble(scenario.moduleId);
  await reporter.onTestModuleStart?.(testModule);
  expect(sink.scopes).toEqual([{ moduleId: scenario.moduleId }]);
  for (const runCase of scenario.cases) {
    await reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
    if (runCase.state === GENERATED_CASE_STATE.FAILED) {
      expect(sink.findings.at(-1)).toEqual({
        moduleId: scenario.moduleId,
        testName: runCase.testName,
        errors: runCase.errors,
      });
    }
  }
}

/**
 * Asserts the reporter awaits each sink append: driven over a scenario with an async
 * sink whose writes land only after a macrotask, the recorded scope and findings match
 * the scenario — which holds only when each hook awaits its append before returning, so
 * the streaming guarantee survives an asynchronous journal backing.
 */
export async function assertReporterAwaitsAsyncAppends(scenario: GeneratedRunScenario): Promise<void> {
  const sink = createAsyncRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  const testModule = buildTestModuleDouble(scenario.moduleId);
  await reporter.onTestModuleStart?.(testModule);
  expect(sink.scopes).toEqual([{ moduleId: scenario.moduleId }]);
  for (const runCase of scenario.cases) {
    await reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
  }
  expect(sink.findings).toEqual(expectedFindingsForScenario(scenario));
}

/** Asserts a journal-streaming run registers the journal reporter on a programmatically started run through the injected starter, carrying no command-line reporter flag. */
export async function assertRunRegistersReporterProgrammatically(
  request: { readonly productDir: string; readonly testPaths: readonly string[] },
): Promise<void> {
  const starter = createSpyVitestRunStarter();
  await runTestsStreaming(request, { sink: createRecordingEvidenceSink(), starter });
  expect(starter.startedRuns).toHaveLength(1);
  expect(starter.startedRuns[0]?.reporters).toHaveLength(1);
  expect(starter.startedRuns[0]?.testPaths).toEqual(request.testPaths);
}

const VITEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "vitest");
// A committed inert suite holding one passing and one runtime-failing case in one
// module — the real-run counterpart of the sibling runner's single-outcome fixtures.
const MIXED_FIXTURE = "mixed.test.ts.fixture";
const MIXED_SUITE_NAME = "suite.test.ts";
const TEMP_PRODUCT_PREFIX = "spx-journal-reporter-";

/**
 * Links this repository's installed runner toolchain into a temp product, so the product
 * directory resolves the Vitest Node API the way an installed product would — from its own
 * `node_modules` — without copying the install and without inheriting any product configuration.
 */
async function linkProductRunnerToolchain(productDir: string): Promise<void> {
  await symlink(
    resolve(CONFIG_PROCESS_CWD.read(), PACKAGE_DEPENDENCIES_DIRECTORY),
    join(productDir, PACKAGE_DEPENDENCIES_DIRECTORY),
    "dir",
  );
}

/**
 * Materializes the committed mixed-case fixture into a fresh temp product outside the
 * repository — so the programmatic run resolves no inherited Vitest config — with the
 * runner toolchain linked in so the product directory resolves Vitest, and invokes the
 * callback with the product directory and the copied suite's relative path.
 */
export function withMixedVitestProduct(
  callback: (productDir: string, testFileName: string) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    await linkProductRunnerToolchain(productDir);
    await copyFile(join(VITEST_FIXTURE_DIR, MIXED_FIXTURE), join(productDir, MIXED_SUITE_NAME));
    await callback(productDir, MIXED_SUITE_NAME);
  });
}

/**
 * Drives a real programmatic Vitest run over the mixed fixture with the production
 * starter and a recording sink, asserting the run records exactly one module scope and
 * one finding — for the failing case, carrying error text and the module's identity —
 * and yields the failed terminal status. The passing case records no finding.
 */
export async function assertRealRunStreamsScopeAndFinding(): Promise<void> {
  await withMixedVitestProduct(async (productDir, testFileName) => {
    const exitCodeBeforeRun = process.exitCode;
    const sink = createRecordingEvidenceSink();
    const outcome = await runTestsStreaming(
      { productDir, testPaths: [testFileName] },
      { sink, starter: createVitestRunStarter(productVitestNodeApiLoader) },
    );
    expect(sink.scopes).toHaveLength(1);
    expect(sink.findings).toHaveLength(1);
    expect(sink.findings[0]?.moduleId).toBe(sink.scopes[0]?.moduleId);
    expect(sink.findings[0]?.errors.length).toBeGreaterThan(0);
    expect(outcome).toEqual({ started: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED });
    expect(process.exitCode).toBe(exitCodeBeforeRun);
  });
}

const PRODUCT_SUPPLIED_PREFIX = "spx-product-supplied-vitest-";
const RUNNERLESS_PREFIX = "spx-runnerless-product-";
/** The file the product-supplied Node API records its `startVitest` arguments into. */
const START_RECORD_FILENAME = "start-vitest-call.json";
/** The version the product-supplied stand-in package declares. */
const PRODUCT_SUPPLIED_VERSION = "0.0.0-product-supplied";
/** The ESM module type the product-supplied stand-in declares so Node imports its entry natively. */
const ESM_PACKAGE_TYPE = "module";

/** The `startVitest` arguments the product-supplied Node API records when the streaming run starts it. */
export interface RecordedVitestStart {
  readonly mode: string;
  readonly files: readonly string[];
  readonly root: string;
}

/** The source of a product-supplied `vitest/node` entry: it records its start arguments and seals the run with the given reason. */
function productSuppliedNodeApiSource(reason: JournalRunTerminalStatus, startRecordPath: string): string {
  return [
    `import { writeFileSync } from "node:fs";`,
    `export async function startVitest(mode, cliFilters, options) {`,
    `  writeFileSync(${
      JSON.stringify(startRecordPath)
    }, JSON.stringify({ mode, files: cliFilters, root: options.root }));`,
    `  for (const reporter of options.reporters) await reporter.onTestRunEnd?.([], [], ${JSON.stringify(reason)});`,
    `  return { close: async () => {} };`,
    `}`,
    ``,
  ].join("\n");
}

/**
 * Writes a product-supplied `vitest` package under the product's `node_modules` whose `node`
 * entry is a real ESM module the product directory resolves and Node imports: it records
 * the `startVitest` arguments it receives and seals the run with the given reason. Returns
 * the entry's real path (the path Node's resolver reports) and the record path.
 */
async function materializeProductSuppliedVitest(
  productDir: string,
  reason: JournalRunTerminalStatus,
): Promise<{ readonly entryPath: string; readonly startRecordPath: string }> {
  const packageDir = join(productDir, PACKAGE_DEPENDENCIES_DIRECTORY, VITEST_PACKAGE_NAME);
  const entryFilename = `${VITEST_NODE_API_ENTRY}.js`;
  const startRecordPath = join(packageDir, START_RECORD_FILENAME);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, PACKAGE_MANIFEST_FILENAME),
    JSON.stringify({
      name: VITEST_PACKAGE_NAME,
      version: PRODUCT_SUPPLIED_VERSION,
      type: ESM_PACKAGE_TYPE,
      exports: { [`./${VITEST_NODE_API_ENTRY}`]: `./${entryFilename}` },
    }),
  );
  await writeFile(join(packageDir, entryFilename), productSuppliedNodeApiSource(reason, startRecordPath));
  return { entryPath: await realpath(join(packageDir, entryFilename)), startRecordPath };
}

/** What a descriptor streaming run driven through the contract loader exposes for inspection. */
export interface ProductResolvedStreamingRunObservation {
  readonly request: JournalRunRequest;
  readonly scenario: GeneratedRunScenario;
  readonly reason: JournalRunTerminalStatus;
  readonly loader: ContractVitestNodeApiLoader;
  readonly sink: RecordingEvidenceSink;
  readonly invocation: JournalRunInvocation;
}

/**
 * Drives the descriptor's streaming run with the production run-starter built over a
 * contract loader, returning the loader's recorded resolve and load calls, the sink's
 * recorded evidence, and the run's outcome for the test to judge.
 */
export async function observeProductResolvedStreamingRun(): Promise<ProductResolvedStreamingRunObservation> {
  const scenario = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario());
  const request = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest());
  const reason = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus());
  const loader = createContractVitestNodeApiLoader(scenario, reason);
  const sink = createRecordingEvidenceSink();
  const invocation = await descriptorRunTestsStreaming(request, {
    sink,
    starter: createVitestRunStarter(loader),
    isLanguagePresent: () => true,
  });
  return { request, scenario, reason, loader, sink, invocation };
}

/** What a descriptor streaming run over a product supplying its own Vitest exposes for inspection. */
export interface ProductSuppliedVitestRunObservation {
  readonly request: JournalRunRequest;
  readonly reason: JournalRunTerminalStatus;
  /** The real path of the product-supplied `vitest/node` entry the harness wrote. */
  readonly productSuppliedEntryPath: string;
  /** The production loader's resolution against the product directory. */
  readonly resolution: VitestNodeApiResolution;
  readonly sink: RecordingEvidenceSink;
  readonly invocation: JournalRunInvocation;
  /** The `startVitest` arguments the product-supplied entry recorded. */
  readonly recordedStart: RecordedVitestStart;
}

/**
 * Materializes a product supplying its own `vitest/node` entry, drives the descriptor's
 * streaming run over it with only a sink — so the descriptor builds its production
 * starter and loader — and returns the resolution the production loader reports, the
 * arguments the product-supplied entry recorded, and the run's outcome.
 */
export function observeProductSuppliedVitestRun(): Promise<ProductSuppliedVitestRunObservation> {
  const reason = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus());
  const testPaths = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).testPaths;
  return withTempDir(PRODUCT_SUPPLIED_PREFIX, async (productDir) => {
    const { entryPath, startRecordPath } = await materializeProductSuppliedVitest(productDir, reason);
    const request: JournalRunRequest = { productDir, testPaths };
    const resolution = productVitestNodeApiLoader.resolve(productDir);
    const sink = createRecordingEvidenceSink();
    const invocation = await descriptorRunTestsStreaming(request, { sink, isLanguagePresent: () => true });
    const recordedStart = JSON.parse(await readFile(startRecordPath, "utf8")) as RecordedVitestStart;
    return { request, reason, productSuppliedEntryPath: entryPath, resolution, sink, invocation, recordedStart };
  });
}

/** What a descriptor streaming run over a product supplying no runner exposes for inspection. */
export interface RunnerlessStreamingRunObservation {
  readonly request: JournalRunRequest;
  /** The production loader's resolution against the runnerless product directory. */
  readonly resolution: VitestNodeApiResolution;
  readonly sink: RecordingEvidenceSink;
  readonly invocation: JournalRunInvocation;
}

/**
 * Drives the descriptor's streaming run, with only a sink, over an empty temp product that
 * supplies no Vitest, and returns the production loader's resolution and the run's outcome.
 */
export function observeRunnerlessStreamingRun(): Promise<RunnerlessStreamingRunObservation> {
  const testPaths = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).testPaths;
  return withTempDir(RUNNERLESS_PREFIX, async (productDir) => {
    const request: JournalRunRequest = { productDir, testPaths };
    const resolution = productVitestNodeApiLoader.resolve(productDir);
    const sink = createRecordingEvidenceSink();
    const invocation = await descriptorRunTestsStreaming(request, { sink, isLanguagePresent: () => true });
    return { request, resolution, sink, invocation };
  });
}
