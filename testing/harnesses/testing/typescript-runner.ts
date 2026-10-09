import { execa } from "execa";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runTestsCommand } from "@/commands/test";
import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import { SPEC_TREE_CONFIG, SPEC_TREE_EVIDENCE_FILE } from "@/lib/spec-tree";
import { pythonTestingLanguage } from "@/test/languages/python";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import type { TestRunnerDependencies } from "@/test/languages/types";
import {
  runTestsStreaming,
  TYPESCRIPT_TEST_FILE_PATTERNS,
  typescriptTestingLanguage,
} from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { TYPESCRIPT_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import {
  expectedFindingsForScenario,
  JOURNAL_REPORTER_TEST_GENERATOR,
  sampleJournalReporterValue,
} from "@testing/generators/testing/journal-reporter";
import {
  sampleTypescriptRunnerValue,
  TYPESCRIPT_RUNNER_TEST_GENERATOR,
} from "@testing/generators/testing/typescript-runner";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { testingCommandDependencies } from "@testing/harnesses/testing/command-support";
import {
  withTestingTempProductDir,
  writeTestFileFixture,
  writeTestingConfig,
} from "@testing/harnesses/testing/harness";
import {
  createRecordingEvidenceSink,
  createScenarioDrivingVitestRunStarter,
  withMixedVitestProduct,
} from "@testing/harnesses/testing/journal-reporter";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const VITEST_FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "fixtures",
  "vitest",
);
const TEMP_PRODUCT_PREFIX = "spx-vitest-";
export const COPIED_SUITE_NAME = "suite.test.ts";
/** The manifest this product — the adapter's own package — declares its dependencies in. */
const PACKAGE_MANIFEST_FILENAME = "package.json";

/** The manifest fields whose entries a package manager installs for the package's consumers. */
interface PackageManifestDependencies {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

/**
 * The names of every package a manifest installs for its consumers — its dependencies,
 * optional dependencies, and peer dependencies — read from the manifest's text.
 */
export function consumerInstalledPackageNames(manifestText: string): readonly string[] {
  const manifest = JSON.parse(manifestText) as PackageManifestDependencies;
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ];
}

/**
 * Reads the names of every package this product's own manifest installs for its consumers,
 * the manifest being the oracle for what the shipped adapter installs alongside itself.
 */
export async function readProductRuntimeDependencyNames(): Promise<readonly string[]> {
  return consumerInstalledPackageNames(
    await readFile(join(CONFIG_PROCESS_CWD.read(), PACKAGE_MANIFEST_FILENAME), "utf8"),
  );
}

// Committed inert fixture suites copied into a temporary product for the real Vitest run.
export const VITEST_FIXTURE = {
  PASSING: "passing.test.ts.fixture",
  FAILING: "failing.test.ts.fixture",
} as const;

export type VitestFixture = (typeof VITEST_FIXTURE)[keyof typeof VITEST_FIXTURE];

// Records the commands the runner constructs and returns a configured exit code
// (Stage 5 exception 6: observability + exception 1-style controllable result).
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: ReadonlyArray<{
    readonly command: string;
    readonly args: readonly string[];
  }>;
}

/** How a recording runner's simulated Vitest invocation leaves its JSON report. */
export const SIMULATED_REPORT = {
  /** Every supplied test file is reported with the status the exit code implies. */
  FOLLOWS_EXIT_CODE: "follows-exit-code",
  /** Only the files in `reportedStatuses` are reported; the rest are omitted. */
  LISTED_FILES: "listed-files",
  /** No report file exists once the invocation exits. */
  MISSING: "missing",
  /** The report file holds text that is not a Vitest JSON report. */
  MALFORMED: "malformed",
} as const;

export type SimulatedReport = (typeof SIMULATED_REPORT)[keyof typeof SIMULATED_REPORT];

export type SimulatedFileStatus = typeof TEST_PATH_VERDICT.PASSED | typeof TEST_PATH_VERDICT.FAILED;

const OUTPUT_FILE_FLAG_PREFIX = "--outputFile.json=";
const MALFORMED_REPORT_TEXT = "not a vitest report";
const SIMULATED_REPORT_ABSENT_MESSAGE = "no simulated report at";

function simulatedReportText(
  options: {
    readonly exitCode: number;
    readonly report: SimulatedReport;
    readonly reportedStatuses: ReadonlyMap<string, SimulatedFileStatus>;
  },
  args: readonly string[],
  testFilePaths: readonly string[],
): string | null {
  if (options.report === SIMULATED_REPORT.MISSING) return null;
  if (options.report === SIMULATED_REPORT.MALFORMED) return MALFORMED_REPORT_TEXT;
  const productRoot = args[args.indexOf("--root") + 1] ?? "";
  const reported = options.report === SIMULATED_REPORT.LISTED_FILES
    ? testFilePaths.filter((path) => options.reportedStatuses.has(path))
    : testFilePaths;
  return JSON.stringify({
    testResults: reported.map((path) => ({
      name: join(productRoot, path),
      status: options.reportedStatuses.get(path)
        ?? (options.exitCode === 0 ? TEST_PATH_VERDICT.PASSED : TEST_PATH_VERDICT.FAILED),
    })),
  });
}

export function createRecordingCommandRunner(options: {
  readonly present: boolean;
  readonly exitCode: number;
  readonly report?: SimulatedReport;
  readonly reportedStatuses?: ReadonlyMap<string, SimulatedFileStatus>;
}): RecordingCommandRunner {
  const calls: Array<{
    readonly command: string;
    readonly args: readonly string[];
  }> = [];
  const reports = new Map<string, string>();
  const simulation = {
    exitCode: options.exitCode,
    report: options.report ?? SIMULATED_REPORT.FOLLOWS_EXIT_CODE,
    reportedStatuses: options.reportedStatuses ?? new Map<string, SimulatedFileStatus>(),
  };
  return {
    calls,
    isLanguagePresent: () => options.present,
    runCommand: (command, args) => {
      calls.push({ command, args });
      const outputFlag = args.find((arg) => arg.startsWith(OUTPUT_FILE_FLAG_PREFIX));
      if (outputFlag !== undefined) {
        const text = simulatedReportText(simulation, args, args.filter((arg) => arg.endsWith(".test.ts")));
        if (text !== null) reports.set(outputFlag.slice(OUTPUT_FILE_FLAG_PREFIX.length), text);
      }
      return Promise.resolve({ exitCode: options.exitCode });
    },
    readReport: (path) => {
      const text = reports.get(path);
      return text === undefined
        ? Promise.reject(new Error(`${SIMULATED_REPORT_ABSENT_MESSAGE} ${path}`))
        : Promise.resolve(text);
    },
  };
}

// A real command runner that executes from the product root (where Vitest resolves);
// the runner's `--root <productDir>` flag isolates Vitest to the temporary product.
export function productRootedCommandRunner(): TestRunnerDependencies {
  return createRepoRootedRecordingCommandRunner();
}

export function createRepoRootedRecordingCommandRunner(): RecordingCommandRunner {
  const calls: Array<{
    readonly command: string;
    readonly args: readonly string[];
  }> = [];
  return {
    calls,
    isLanguagePresent: () => true,
    runCommand: async (command, args) => {
      calls.push({ command, args });
      const result = await execa(command, [...args], {
        cwd: process.cwd(),
        reject: false,
      });
      return { exitCode: result.exitCode ?? 0 };
    },
  };
}

function oracleTypescriptExcludeFlag(nodePath: string): string {
  return `--exclude=${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}/**`;
}

function generatedTestPathForPattern(pattern: string): string {
  const nodePath = sampleTypescriptRunnerValue(
    TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePath(),
  );
  const generatedName = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
  return [
    SPEC_TREE_CONFIG.ROOT_DIRECTORY,
    nodePath,
    SPEC_TREE_EVIDENCE_FILE.DIRECTORY_NAME,
    pattern.replace("*", generatedName),
  ].join("/");
}

// Copies a committed fixture suite into a temporary product outside the repository so Vitest
// resolves no inherited config and runs the suite under defaults.
export function withTempVitestProduct(
  fixture: VitestFixture,
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  return withTempVitestProductAt(fixture, COPIED_SUITE_NAME, callback);
}

export function withTempVitestProductAt(
  fixture: VitestFixture,
  relativeTestPath: string,
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    const targetPath = join(productDir, relativeTestPath);
    await mkdir(dirname(targetPath), { recursive: true });
    await copyFile(join(VITEST_FIXTURE_DIR, fixture), targetPath);
    await callback(productDir);
  });
}

// A temporary Vitest product holding several suites: the temp root and the product-relative path of each
// copied suite, in the order of the fixtures supplied.
export interface TempVitestSuites {
  readonly productDir: string;
  readonly suitePaths: readonly string[];
}

const COPIED_SUITES_BASENAME_PREFIX = "suite-";

// Copies committed fixture suites into one temporary product outside the repository, each under a
// distinct file name, so one Vitest invocation covers them all and reports one verdict per file.
export function withTempVitestSuites(
  fixtures: readonly VitestFixture[],
  callback: (product: TempVitestSuites) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    const suitePaths: string[] = [];
    for (const [index, fixture] of fixtures.entries()) {
      const suitePath = `${COPIED_SUITES_BASENAME_PREFIX}${index}${COPIED_SUITE_NAME}`;
      await writeVitestFixture(productDir, suitePath, fixture);
      suitePaths.push(suitePath);
    }
    await callback({ productDir, suitePaths });
  });
}

export interface TempVitestProductObservation {
  /** The product directory the callback received. */
  readonly productDir: string;
  /** The product's directory entries while the callback ran. */
  readonly entriesDuringCallback: readonly string[];
  /** Whether the product directory still exists once the callback has settled. */
  readonly existsAfterCallback: boolean;
}

// Runs a callback through `withTempVitestProduct` and reports what the product looked like
// during the callback and whether it survived it; the linked test owns every predicate.
export async function observeTempVitestProductLifecycle(
  fixture: VitestFixture,
): Promise<TempVitestProductObservation> {
  let productDir = "";
  let entriesDuringCallback: readonly string[] = [];

  await withTempVitestProduct(fixture, async (receivedProductDir) => {
    productDir = receivedProductDir;
    entriesDuringCallback = await readdir(receivedProductDir);
  });

  return { productDir, entriesDuringCallback, existsAfterCallback: await pathExists(productDir) };
}

export interface TempVitestProductFailureObservation {
  /** Whether the product directory existed when the callback threw. */
  readonly existedDuringCallback: boolean;
  /** Whether the product directory still exists once the failed callback has settled. */
  readonly existsAfterCallback: boolean;
  /** What `withTempVitestProduct` rejected with. */
  readonly rejection: unknown;
}

// Runs a throwing callback through `withTempVitestProduct` and reports the product's existence
// around the throw and the rejection the caller observes.
export async function observeTempVitestProductAfterThrow(
  fixture: VitestFixture,
  failure: Error,
): Promise<TempVitestProductFailureObservation> {
  let productDir = "";
  let existedDuringCallback = false;
  let rejection: unknown;

  try {
    await withTempVitestProduct(fixture, async (receivedProductDir) => {
      productDir = receivedProductDir;
      existedDuringCallback = await pathExists(receivedProductDir);
      throw failure;
    });
  } catch (error: unknown) {
    rejection = error;
  }

  return { existedDuringCallback, existsAfterCallback: await pathExists(productDir), rejection };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function writeVitestFixture(
  productDir: string,
  relativePath: string,
  fixture: VitestFixture,
): Promise<void> {
  const target = join(productDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(VITEST_FIXTURE_DIR, fixture), target);
}

export async function runWithSimulatedReport(
  options: {
    readonly exitCode: number;
    readonly report: SimulatedReport;
    readonly reportedStatuses?: ReadonlyMap<string, SimulatedFileStatus>;
  },
  testPaths: readonly string[],
) {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    const runner = createRecordingCommandRunner({ present: true, ...options });
    return typescriptTestingLanguage.runTests(
      { productDir, testPaths, excludedNodePaths: [] },
      runner,
    );
  });
}

export function twoDistinctTestPaths(): readonly [string, string] {
  const [firstNode, secondNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
  return [
    sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, firstNode)),
    sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, secondNode)),
  ];
}

export function registerTypescriptRunnerScenarioL1Tests(): void {
  describe("typescript test runner invocation", () => {
    it("passes config-derived node exclusions to vitest for spx test passing", async () => {
      const [excludedNodePath, includedNodePath] = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.distinctNodePaths(),
      );
      const excludedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNodePath),
      );
      const includedTestPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNodePath),
      );
      const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, excludedTestPath);
        await writeTestFileFixture(productDir, includedTestPath);
        await writeTestingConfig(productDir, {
          exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNodePath}`],
        });

        await runTestsCommand(
          { productDir, passing: true },
          testingCommandDependencies(runner),
        );

        const invokedArgs = runner.calls.flatMap((call) => call.args);
        expect(runner.calls).toHaveLength(1);
        expect(invokedArgs).toContain(oracleTypescriptExcludeFlag(excludedNodePath));
        expect(invokedArgs).toContain(includedTestPath);
        expect(invokedArgs).not.toContain(excludedTestPath);
      });
    });

    it("does not invoke vitest through spx test when TypeScript is absent", async () => {
      const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
      const testPath = sampleDispatchValue(
        TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
      );
      const runner = createRecordingCommandRunner({
        present: false,
        exitCode: sampleTypescriptRunnerValue(
          TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(),
        ),
      });

      await withTestingTempProductDir(async (productDir) => {
        await writeTestFileFixture(productDir, testPath);

        const result = await runTestsCommand(
          { productDir, passing: false },
          testingCommandDependencies(runner),
        );

        expect(result.dispatch.reports).toHaveLength(0);
        expect(runner.calls).toHaveLength(0);
      });
    });

    it("propagates the command runner exit code when vitest is invoked", async () => {
      await assertProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(),
        async (exitCode) => {
          const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
          const testPath = sampleDispatchValue(
            TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
          );
          await withTestingTempProductDir(async (productDir) => {
            const runner = createRecordingCommandRunner({ present: true, exitCode });
            await writeTestFileFixture(productDir, testPath);

            const result = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(runner),
            );

            expect(result.dispatch.exitCode).toBe(exitCode);
            expect(runner.calls).toHaveLength(1);
          });
        },
        { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
      );
    });
  });
}

export function registerTypescriptRunnerScenarioL2Tests(): void {
  describe("typescript test runner drives real vitest", () => {
    it("invokes vitest against a passing product and exits zero", async () => {
      const [testPath, failingDecoyPath] = sampleTypescriptRunnerValue(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.testPathPair(),
      );
      await withTempVitestProductAt(
        VITEST_FIXTURE.PASSING,
        testPath,
        async (productDir) => {
          await writeVitestFixture(
            productDir,
            failingDecoyPath,
            VITEST_FIXTURE.FAILING,
          );
          const runner = createRepoRootedRecordingCommandRunner();
          const result = await runTestsCommand(
            {
              productDir,
              passing: false,
              targets: { operands: [testPath], recursive: false },
            },
            testingCommandDependencies(runner),
          );

          expect(result.dispatch.exitCode).toBe(0);
          expect(runner.calls.flatMap((call) => call.args)).toContain(testPath);
        },
      );
    });

    it("invokes vitest against a failing product and exits non-zero", async () => {
      const testPath = sampleTypescriptRunnerValue(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.testFilePath(),
      );
      await withTempVitestProductAt(
        VITEST_FIXTURE.FAILING,
        testPath,
        async (productDir) => {
          const runner = createRepoRootedRecordingCommandRunner();
          const result = await runTestsCommand(
            {
              productDir,
              passing: false,
              targets: { operands: [testPath], recursive: false },
            },
            testingCommandDependencies(runner),
          );

          expect(result.dispatch.exitCode).not.toBe(0);
          expect(runner.calls.flatMap((call) => call.args)).toContain(testPath);
        },
      );
    });
  });
}

export function registerTypescriptRunnerMappingTests(): void {
  describe("typescript test runner file matching and exclusion flags", () => {
    it("declares every spec-defined TypeScript test-file pattern", () => {
      expect(typescriptTestingLanguage.testFilePatterns).toEqual(
        TYPESCRIPT_TEST_FILE_PATTERNS,
      );
    });

    it.each(TYPESCRIPT_TEST_FILE_PATTERNS)(
      "routes registered test-file pattern %s through spx test",
      async (pattern) => {
        const testPath = generatedTestPathForPattern(pattern);
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
        expect(
          typescriptTestingLanguage.matchesTestFile(testPath),
        ).toBe(true);
        await withTestingTempProductDir(async (productDir) => {
          await writeTestFileFixture(productDir, testPath);

          await runTestsCommand(
            { productDir, passing: false },
            testingCommandDependencies(runner),
          );

          expect(runner.calls.flatMap((call) => call.args)).toContain(testPath);
        });
      },
    );

    it.each(
      sampleTypescriptRunnerValue(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePathPair(),
      ),
    )(
      "maps excluded node %s to the independent CLI flag oracle",
      async (nodePath) => {
        const includedNodePath = sampleDispatchValue(
          TEST_DISPATCH_GENERATOR.distinctNodePaths(),
        ).find((candidate) => candidate !== nodePath);
        expect(includedNodePath).toBeDefined();
        if (includedNodePath === undefined) return;
        const excludedTestPath = sampleDispatchValue(
          TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
        );
        const includedTestPath = sampleDispatchValue(
          TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNodePath),
        );
        const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

        await withTestingTempProductDir(async (productDir) => {
          await writeTestFileFixture(productDir, excludedTestPath);
          await writeTestFileFixture(productDir, includedTestPath);
          await writeTestingConfig(productDir, {
            exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${nodePath}`],
          });

          await runTestsCommand(
            { productDir, passing: true },
            testingCommandDependencies(runner),
          );

          expect(runner.calls.flatMap((call) => call.args)).toContain(
            oracleTypescriptExcludeFlag(nodePath),
          );
        });
      },
    );
  });
}

export function registerTypescriptRunnerComplianceTests(): void {
  describe("typescript test runner gating on TypeScript presence", () => {
    it("invokes vitest exactly when TypeScript is present", async () => {
      await assertProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.present(),
        async (present) => {
          const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
          const testPath = sampleDispatchValue(
            TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
          );
          await withTestingTempProductDir(async (productDir) => {
            const runner = createRecordingCommandRunner({ present, exitCode: 0 });
            await writeTestFileFixture(productDir, testPath);

            const result = await runTestsCommand(
              { productDir, passing: false },
              testingCommandDependencies(runner),
            );

            expect(result.dispatch.reports).toHaveLength(present ? 1 : 0);
            expect(runner.calls).toHaveLength(present ? 1 : 0);
          });
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("detect reflects the injected presence predicate", () => {
      assertProperty(
        TYPESCRIPT_RUNNER_TEST_GENERATOR.present(),
        (present) => {
          expect(
            typescriptTestingLanguage.detect(
              sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
              { isLanguagePresent: () => present },
            ),
          ).toBe(present);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("detect falls back to marker-based TypeScript detection", async () => {
      await withTestingTempProductDir(async (productDir) => {
        expect(typescriptTestingLanguage.detect(productDir)).toBe(false);
        await writeFile(join(productDir, TYPESCRIPT_MARKER), "");
        expect(typescriptTestingLanguage.detect(productDir)).toBe(true);
      });
    });
  });

  describe("typescript descriptor journal-streaming run", () => {
    it("exposes a journal-streaming run alongside its CLI-flag run, enumerated through the testing registry", () => {
      // A language-neutral consumer finds the streaming-capable descriptor by iterating the
      // registry and selecting on the optional runTestsStreaming capability, never importing
      // the descriptor module. The TypeScript descriptor exposes the streaming run beside its
      // CLI-flag runTests.
      const streamingDescriptors = testingRegistry.languages.filter(
        (language) => language.runTestsStreaming !== undefined,
      );
      expect(streamingDescriptors).toContain(typescriptTestingLanguage);
      // A registered descriptor that exposes no streaming run — the Python descriptor —
      // is excluded from the streaming-capable set, so the capability filter never widens
      // to a non-streaming language.
      expect(streamingDescriptors).not.toContain(pythonTestingLanguage);
      expect(typescriptTestingLanguage.runTests).toBeDefined();
      expect(typescriptTestingLanguage.runTestsStreaming).toBe(runTestsStreaming);
    });

    it("streams per-module scope and per-failing-case findings into the injected sink through the reporter", async () => {
      const scenario = sampleJournalReporterValue(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
      );
      const request = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest());
      const reason = JOURNAL_RUN_TERMINAL_STATUS.FAILED;
      const sink = createRecordingEvidenceSink();
      const starter = createScenarioDrivingVitestRunStarter(scenario, reason);

      // The descriptor's streaming run is reached as the registry enumerates it; the injected
      // starter drives the reporter the run registers, so this l1 run streams evidence without
      // spawning Vitest.
      const descriptor = testingRegistry.languages.find(
        (language) => language.runTestsStreaming !== undefined,
      );
      expect(descriptor).toBe(typescriptTestingLanguage);

      const invocation = await runTestsStreaming(request, {
        sink,
        starter,
        isLanguagePresent: () => true,
      });

      expect(starter.startedRuns).toHaveLength(1);
      expect(starter.startedRuns[0]?.reporters).toHaveLength(1);
      expect(sink.scopes).toEqual([{ moduleId: scenario.moduleId }]);
      expect(sink.findings).toEqual(expectedFindingsForScenario(scenario));
      expect(invocation).toEqual({ invoked: true, terminalStatus: reason });
    });

    it("gates the streaming run out without starting Vitest when TypeScript is absent", async () => {
      const request = sampleJournalReporterValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest());
      const scenario = sampleJournalReporterValue(
        JOURNAL_REPORTER_TEST_GENERATOR.mixedRunScenario(),
      );
      const sink = createRecordingEvidenceSink();
      const starter = createScenarioDrivingVitestRunStarter(scenario, JOURNAL_RUN_TERMINAL_STATUS.FAILED);

      // Detection reports TypeScript absent, so the streaming run short-circuits before the
      // starter runs — no Vitest is invoked and no evidence streams — matching runTests's gate.
      const invocation = await runTestsStreaming(request, {
        sink,
        starter,
        isLanguagePresent: () => false,
      });

      expect(invocation).toEqual({ invoked: false });
      expect(starter.startedRuns).toEqual([]);
      expect(sink.scopes).toEqual([]);
      expect(sink.findings).toEqual([]);
    });
  });
}

export function registerTypescriptRunnerStreamingL2Tests(): void {
  describe("typescript descriptor journal-streaming run drives real vitest", () => {
    it("resolves the default vitest starter and streams evidence when driven with only a sink", async () => {
      await withMixedVitestProduct(async (productDir, testFileName) => {
        const exitCodeBeforeRun = process.exitCode;
        const sink = createRecordingEvidenceSink();

        // A language-neutral consumer supplies only the sink, so the descriptor resolves its
        // default production Vitest starter and streams over a real programmatic run. Detection
        // is forced present because the isolated temp product carries no TypeScript marker.
        const streamingRun = typescriptTestingLanguage.runTestsStreaming;
        expect(streamingRun).toBeDefined();
        if (streamingRun === undefined) return;
        const invocation = await streamingRun(
          { productDir, testPaths: [testFileName] },
          { sink, isLanguagePresent: () => true },
        );

        expect(sink.scopes).toHaveLength(1);
        expect(sink.findings).toHaveLength(1);
        expect(sink.findings[0]?.moduleId).toBe(sink.scopes[0]?.moduleId);
        expect(invocation).toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED });
        expect(process.exitCode).toBe(exitCodeBeforeRun);
      });
    });
  });
}

export const typescriptRunnerScenarioL1Cases = collectHarnessTestCases(
  registerTypescriptRunnerScenarioL1Tests,
);
export const typescriptRunnerScenarioL2Cases = collectHarnessTestCases(
  registerTypescriptRunnerScenarioL2Tests,
);
export const typescriptRunnerMappingCases = collectHarnessTestCases(
  registerTypescriptRunnerMappingTests,
);
export const typescriptRunnerComplianceCases = collectHarnessTestCases(
  registerTypescriptRunnerComplianceTests,
);
export const typescriptRunnerStreamingL2Cases = collectHarnessTestCases(
  registerTypescriptRunnerStreamingL2Tests,
);
