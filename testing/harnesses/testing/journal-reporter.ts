import { copyFile, mkdir, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import type { Reporter, TestCase, TestModule, Vitest } from "vitest/node";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import {
  createJournalReporter,
  createVitestRunStarter,
  type JournalRunOutcome,
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
import type {
  JournalRunInvocation,
  JournalRunRequest,
  JournalRunTerminalStatus,
  TestFinding,
  TestRunEvidenceSink,
  TestScopeUnit,
} from "@/test/languages/types";
import { runTestsStreaming as descriptorRunTestsStreaming } from "@/test/languages/typescript";
import { CONFIG_TEST_GENERATOR } from "@testing/generators/config/descriptors";
import { sampleGeneratedValue } from "@testing/generators/sample";
import type { GeneratedRunCase, GeneratedRunScenario } from "@testing/generators/testing/journal-reporter";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
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
  if (declared === undefined) return [];
  const entries = Array.isArray(declared) ? declared : [declared];
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

/** A recording sink driven with interleaved appends, plus the appends the driver made in the order it made them. */
export interface InterleavedSinkObservation {
  readonly sink: RecordingEvidenceSink;
  /** Every append performed against the sink, in invocation order across both channels. */
  readonly appended: readonly RecordedSinkCall[];
}

/**
 * Drives a fresh recording sink with the given scope and finding appends interleaved —
 * so the recorded call order exercises cross-channel invocation order — and returns the
 * sink alongside the appends as they were performed, for the test to compare.
 */
export function observeInterleavedSinkAppends(
  scopes: readonly TestScopeUnit[],
  findings: readonly TestFinding[],
): InterleavedSinkObservation {
  const sink = createRecordingEvidenceSink();
  const appended: RecordedSinkCall[] = [];
  for (let i = 0; i < Math.max(scopes.length, findings.length); i += 1) {
    if (i < scopes.length) {
      const unit = scopes[i];
      sink.appendScope(unit);
      appended.push({ kind: "scope", unit });
    }
    if (i < findings.length) {
      const finding = findings[i];
      sink.appendFinding(finding);
      appended.push({ kind: "finding", finding });
    }
  }
  return { sink, appended };
}

/** Snapshots of one async-sink channel at three points around a single append. */
export interface AsyncAppendTimingObservation<T> {
  /** The channel's contents right after the append is issued, before any await. */
  readonly beforeAwait: readonly T[];
  /** The channel's contents after one microtask tick. */
  readonly afterMicrotask: readonly T[];
  /** The channel's contents after the append's promise resolves. */
  readonly afterAwait: readonly T[];
}

/** Both channels of the async recording sink observed around one scope append and one finding append. */
export interface AsyncSinkTimingObservation {
  readonly scope: AsyncAppendTimingObservation<TestScopeUnit>;
  readonly finding: AsyncAppendTimingObservation<TestFinding>;
}

/**
 * Issues one scope append and one finding append against the async recording sink and
 * snapshots each channel before awaiting, after a microtask tick, and after the append's
 * promise resolves — the timing a reporter's await-behavior test rests on.
 */
export async function observeAsyncSinkAppendTiming(
  unit: TestScopeUnit,
  finding: TestFinding,
): Promise<AsyncSinkTimingObservation> {
  const sink = createAsyncRecordingEvidenceSink();

  const scopePending = sink.appendScope(unit);
  const scopeBeforeAwait = [...sink.scopes];
  await Promise.resolve();
  const scopeAfterMicrotask = [...sink.scopes];
  await scopePending;
  const scopeAfterAwait = [...sink.scopes];

  const findingPending = sink.appendFinding(finding);
  const findingBeforeAwait = [...sink.findings];
  await Promise.resolve();
  const findingAfterMicrotask = [...sink.findings];
  await findingPending;
  const findingAfterAwait = [...sink.findings];

  return {
    scope: { beforeAwait: scopeBeforeAwait, afterMicrotask: scopeAfterMicrotask, afterAwait: scopeAfterAwait },
    finding: { beforeAwait: findingBeforeAwait, afterMicrotask: findingAfterMicrotask, afterAwait: findingAfterAwait },
  };
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

/** What the reporter recorded after being driven over a whole scenario: the sink's channels and the captured terminal status. */
export interface ReporterMappingObservation {
  readonly scopes: readonly TestScopeUnit[];
  readonly findings: readonly TestFinding[];
  readonly terminalStatus: JournalRunTerminalStatus | undefined;
}

/** Drives a journal reporter over a scenario, sealing with the given reason, and returns what the sink recorded and the status the reporter captured. */
export async function observeJournalReporterMapping(
  scenario: GeneratedRunScenario,
  reason: JournalRunTerminalStatus,
): Promise<ReporterMappingObservation> {
  const sink = createRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  await driveReporterOverScenario(reporter, scenario, reason);
  return { scopes: sink.scopes, findings: sink.findings, terminalStatus: reporter.terminalStatus };
}

/** The sink's findings channel as it stood right after one case's result hook returned. */
export interface CaseResultSnapshot {
  readonly runCase: GeneratedRunCase;
  readonly findings: readonly TestFinding[];
}

/** Per-hook snapshots of what the reporter had recorded when each lifecycle hook returned, before run end. */
export interface ReporterPerHookObservation {
  /** The sink's scopes right after the module-start hook returned. */
  readonly scopesAfterModuleStart: readonly TestScopeUnit[];
  /** The sink's findings right after each case's result hook returned, in case order. */
  readonly caseSnapshots: readonly CaseResultSnapshot[];
}

/**
 * Drives a journal reporter hook by hook over a scenario with a recording sink and
 * snapshots the sink after each hook returns, so a test can tell whether evidence was
 * recorded as its hook fired or only at run end.
 */
export async function observeReporterPerHook(scenario: GeneratedRunScenario): Promise<ReporterPerHookObservation> {
  const sink = createRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  const testModule = buildTestModuleDouble(scenario.moduleId);
  await reporter.onTestModuleStart?.(testModule);
  const scopesAfterModuleStart = [...sink.scopes];
  const caseSnapshots: CaseResultSnapshot[] = [];
  for (const runCase of scenario.cases) {
    await reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
    caseSnapshots.push({ runCase, findings: [...sink.findings] });
  }
  return { scopesAfterModuleStart, caseSnapshots };
}

/** What an async recording sink held after each reporter hook returned. */
export interface ReporterAsyncSinkObservation {
  /** The sink's scopes right after the module-start hook returned. */
  readonly scopesAfterModuleStart: readonly TestScopeUnit[];
  /** The sink's findings right after the last case's result hook returned. */
  readonly findingsAfterCases: readonly TestFinding[];
}

/**
 * Drives a journal reporter over a scenario with the async recording sink, whose
 * appends land only after a macrotask, and returns what the sink held when each hook
 * returned — populated only when the hook awaited its append before returning.
 */
export async function observeReporterWithAsyncSink(
  scenario: GeneratedRunScenario,
): Promise<ReporterAsyncSinkObservation> {
  const sink = createAsyncRecordingEvidenceSink();
  const reporter = createJournalReporter(sink);
  const testModule = buildTestModuleDouble(scenario.moduleId);
  await reporter.onTestModuleStart?.(testModule);
  const scopesAfterModuleStart = [...sink.scopes];
  for (const runCase of scenario.cases) {
    await reporter.onTestCaseResult?.(buildTestCaseDouble(scenario.moduleId, runCase));
  }
  return { scopesAfterModuleStart, findingsAfterCases: [...sink.findings] };
}

/** Drives a journal-streaming run through a spy starter and returns the start options the run supplied it. */
export async function observeStreamingRunStart(
  request: JournalRunRequest,
): Promise<readonly VitestRunStartOptions[]> {
  const starter = createSpyVitestRunStarter();
  await runTestsStreaming(request, { sink: createRecordingEvidenceSink(), starter });
  return starter.startedRuns;
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
export function withMixedVitestProduct<T>(
  callback: (productDir: string, testFileName: string) => Promise<T>,
): Promise<T> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    await linkProductRunnerToolchain(productDir);
    await copyFile(join(VITEST_FIXTURE_DIR, MIXED_FIXTURE), join(productDir, MIXED_SUITE_NAME));
    return callback(productDir, MIXED_SUITE_NAME);
  });
}

/** What a real programmatic Vitest run over the mixed fixture exposes for inspection. */
export interface RealMixedRunObservation {
  readonly sink: RecordingEvidenceSink;
  readonly outcome: JournalRunOutcome;
  /** `process.exitCode` as it stood before the run started. */
  readonly exitCodeBeforeRun: typeof process.exitCode;
  /** `process.exitCode` as it stood after the run resolved. */
  readonly exitCodeAfterRun: typeof process.exitCode;
}

/**
 * Drives a real programmatic Vitest run over the mixed fixture with the production
 * starter over the product-resolving loader and a recording sink, and returns what the
 * sink recorded, the run's outcome, and the process exit code before and after the run.
 */
export function observeRealMixedRun(): Promise<RealMixedRunObservation> {
  return withMixedVitestProduct(async (productDir, testFileName) => {
    const exitCodeBeforeRun = process.exitCode;
    const sink = createRecordingEvidenceSink();
    const outcome = await runTestsStreaming(
      { productDir, testPaths: [testFileName] },
      { sink, starter: createVitestRunStarter(productVitestNodeApiLoader) },
    );
    return { sink, outcome, exitCodeBeforeRun, exitCodeAfterRun: process.exitCode };
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

/** The `exports` subpath a product's Vitest package maps the Node API entry under. */
const NODE_API_EXPORT_SUBPATH = `./${VITEST_NODE_API_ENTRY}`;
/** The Node API entry file a product's Vitest package ships. */
const NODE_API_ENTRY_FILENAME = `${VITEST_NODE_API_ENTRY}.js`;
/** A package's root export subpath and the entry it maps to, for a manifest exporting no Node API. */
const PACKAGE_ROOT_EXPORT_SUBPATH = ".";
const PACKAGE_ROOT_ENTRY = "./index.js";
/** A manifest Node cannot parse as a package configuration. */
const MALFORMED_MANIFEST_TEXT = "{";

/** The manifest of a product-supplied `vitest` package with the given `exports` map. */
function productVitestManifest(exports: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({
    name: VITEST_PACKAGE_NAME,
    version: PRODUCT_SUPPLIED_VERSION,
    type: ESM_PACKAGE_TYPE,
    exports,
  });
}

/** Writes a `vitest` package directory holding the given manifest text under the product's `node_modules`, returning the package directory. */
async function writeProductVitestPackage(productDir: string, manifestText: string): Promise<string> {
  const packageDir = join(productDir, PACKAGE_DEPENDENCIES_DIRECTORY, VITEST_PACKAGE_NAME);
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, PACKAGE_MANIFEST_FILENAME), manifestText);
  return packageDir;
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
  nodeApiExports: Readonly<Record<string, unknown>> = UNCONDITIONAL_NODE_API_EXPORTS,
): Promise<{ readonly entryPath: string; readonly startRecordPath: string }> {
  const packageDir = await writeProductVitestPackage(productDir, productVitestManifest(nodeApiExports));
  const startRecordPath = join(packageDir, START_RECORD_FILENAME);
  await writeFile(join(packageDir, NODE_API_ENTRY_FILENAME), productSuppliedNodeApiSource(reason, startRecordPath));
  return { entryPath: await realpath(join(packageDir, NODE_API_ENTRY_FILENAME)), startRecordPath };
}

/** What a descriptor streaming run over a product whose Vitest package exposes no usable Node API entry exposes for inspection. */
export interface UnresolvableNodeApiObservation {
  readonly request: JournalRunRequest;
  /** The production loader's resolution against the product directory. */
  readonly resolution: VitestNodeApiResolution;
  readonly sink: RecordingEvidenceSink;
  readonly invocation: JournalRunInvocation;
}

/** Products that carry a `vitest` package the loader must still report as runnerless, plus one whose manifest is unreadable. */
export interface ProductsWithoutNodeApiObservation {
  /** The package's `exports` map carries no Node API subpath. */
  readonly withoutNodeExport: UnresolvableNodeApiObservation;
  /** The package maps the Node API subpath to an entry file that does not exist. */
  readonly nodeEntryMissing: UnresolvableNodeApiObservation;
  /** The package manifest is not parseable; the loader's resolution attempt and whatever it threw. */
  readonly malformedManifest: {
    readonly request: JournalRunRequest;
    /** The error resolution threw, or `undefined` when it returned instead. */
    readonly resolutionError: unknown;
  };
}

async function observeUnresolvableNodeApi(manifestText: string): Promise<UnresolvableNodeApiObservation> {
  const testPaths = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).testPaths;
  return withTempDir(RUNNERLESS_PREFIX, async (productDir) => {
    await writeProductVitestPackage(productDir, manifestText);
    const request: JournalRunRequest = { productDir, testPaths };
    const resolution = productVitestNodeApiLoader.resolve(productDir);
    const sink = createRecordingEvidenceSink();
    const invocation = await descriptorRunTestsStreaming(request, { sink, isLanguagePresent: () => true });
    return { request, resolution, sink, invocation };
  });
}

/**
 * Materializes, one after another, a product whose `vitest` package exports no Node API
 * subpath, one whose Node API subpath maps to a missing file, and one whose manifest is
 * malformed; drives the production loader and the descriptor's streaming run over the
 * first two and the loader alone over the third, returning every observation.
 */
export async function observeProductsWithoutNodeApi(): Promise<ProductsWithoutNodeApiObservation> {
  const withoutNodeExport = await observeUnresolvableNodeApi(
    productVitestManifest({ [PACKAGE_ROOT_EXPORT_SUBPATH]: PACKAGE_ROOT_ENTRY }),
  );
  const nodeEntryMissing = await observeUnresolvableNodeApi(
    productVitestManifest({ [NODE_API_EXPORT_SUBPATH]: `./${NODE_API_ENTRY_FILENAME}` }),
  );
  const testPaths = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).testPaths;
  const malformedManifest = await withTempDir(RUNNERLESS_PREFIX, async (productDir) => {
    await writeProductVitestPackage(productDir, MALFORMED_MANIFEST_TEXT);
    const request: JournalRunRequest = { productDir, testPaths };
    try {
      productVitestNodeApiLoader.resolve(productDir);
      return { request, resolutionError: undefined };
    } catch (error: unknown) {
      return { request, resolutionError: error };
    }
  });
  return { withoutNodeExport, nodeEntryMissing, malformedManifest };
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
/** The types declaration a product's package maps beside an import-only Node API entry. */
const NODE_API_TYPES_FILENAME = `${VITEST_NODE_API_ENTRY}.d.ts`;

/** The manifest `exports` shapes a product's Vitest may declare its Node API entry through. */
const UNCONDITIONAL_NODE_API_EXPORTS: Readonly<Record<string, unknown>> = {
  [NODE_API_EXPORT_SUBPATH]: `./${NODE_API_ENTRY_FILENAME}`,
};
/** The Node API entry declared under the `import` and `types` conditions only — no `default`, no `require`. */
const IMPORT_CONDITIONED_NODE_API_EXPORTS: Readonly<Record<string, unknown>> = {
  [NODE_API_EXPORT_SUBPATH]: {
    import: `./${NODE_API_ENTRY_FILENAME}`,
    types: `./${NODE_API_TYPES_FILENAME}`,
  },
};
/** Every subpath declared through one pattern key whose wildcard names the entry file. */
const PATTERN_NODE_API_EXPORTS: Readonly<Record<string, unknown>> = {
  "./*": "./*.js",
};

/**
 * Drives the descriptor's streaming run, with only a sink, over a product whose Vitest
 * package declares its Node API entry through the given `exports` shape, resolving the
 * product directory through the production loader alongside; returns what the product's
 * entry recorded and what the run yielded.
 */
async function observeSuppliedVitestRun(
  productDir: string,
  reason: JournalRunTerminalStatus,
  nodeApiExports: Readonly<Record<string, unknown>>,
  runProductDir: string = productDir,
): Promise<ProductSuppliedVitestRunObservation> {
  const testPaths = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).testPaths;
  const { entryPath, startRecordPath } = await materializeProductSuppliedVitest(productDir, reason, nodeApiExports);
  const request: JournalRunRequest = { productDir: runProductDir, testPaths };
  const resolution = productVitestNodeApiLoader.resolve(runProductDir);
  const sink = createRecordingEvidenceSink();
  const invocation = await descriptorRunTestsStreaming(request, { sink, isLanguagePresent: () => true });
  const recordedStart = JSON.parse(await readFile(startRecordPath, "utf8")) as RecordedVitestStart;
  return { request, reason, productSuppliedEntryPath: entryPath, resolution, sink, invocation, recordedStart };
}

/** Observes the run over a product whose Vitest declares the Node API entry as an unconditional string target. */
export function observeProductSuppliedVitestRun(): Promise<ProductSuppliedVitestRunObservation> {
  const reason = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus());
  return withTempDir(
    PRODUCT_SUPPLIED_PREFIX,
    (productDir) => observeSuppliedVitestRun(productDir, reason, UNCONDITIONAL_NODE_API_EXPORTS),
  );
}

/** Observes the run over a product whose Vitest declares every subpath through one pattern export key. */
export function observePatternExportedVitestRun(): Promise<ProductSuppliedVitestRunObservation> {
  const reason = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus());
  return withTempDir(
    PRODUCT_SUPPLIED_PREFIX,
    (productDir) => observeSuppliedVitestRun(productDir, reason, PATTERN_NODE_API_EXPORTS),
  );
}

/**
 * Materializes a product whose `vitest` package maps the Node API entry only under the
 * `import` and `types` conditions — no `default` and no `require` — and drives the
 * descriptor's streaming run over it with only a sink, returning the same observation
 * shape as the unconditional product-supplied run.
 */
export function observeImportConditionedVitestRun(): Promise<ProductSuppliedVitestRunObservation> {
  const reason = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus());
  return withTempDir(
    PRODUCT_SUPPLIED_PREFIX,
    (productDir) => observeSuppliedVitestRun(productDir, reason, IMPORT_CONDITIONED_NODE_API_EXPORTS),
  );
}

const HOISTED_WORKSPACE_PREFIX = "spx-hoisted-vitest-workspace-";

/**
 * Materializes a workspace whose `vitest` package sits under the workspace root's
 * `node_modules` while the product directory is a member directory below it that installs
 * nothing of its own — the hoisted layout a workspace package manager produces — and drives
 * the descriptor's streaming run over the member product with only a sink, returning the
 * same observation shape as the product-supplied run.
 */
export function observeHoistedVitestRun(): Promise<ProductSuppliedVitestRunObservation> {
  const reason = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.terminalStatus());
  const memberDirectoryName = sampleGeneratedValue(CONFIG_TEST_GENERATOR.key());
  return withTempDir(HOISTED_WORKSPACE_PREFIX, async (workspaceDir) => {
    const productDir = join(workspaceDir, memberDirectoryName);
    await mkdir(productDir, { recursive: true });
    return observeSuppliedVitestRun(workspaceDir, reason, UNCONDITIONAL_NODE_API_EXPORTS, productDir);
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
