import { execa } from "execa";
import * as fc from "fast-check";
import assert from "node:assert";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PYTHON_PRODUCT_INPUT_PATH, PYTHON_TEST_FILE_EXTENSION, pythonTestingLanguage } from "@/test/languages/python";
import { JUNIT_REPORT_FLAG_PREFIX, PYTEST_INVOKE_ARGS, UV_COMMAND } from "@/test/languages/python-pytest-contract";
import type { TestRunCommandResult, TestRunnerDependencies } from "@/test/languages/types";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
import {
  reportedStatusRunners,
  SIMULATED_REPORT,
  SIMULATED_REPORT_ABSENT_MESSAGE,
  type SimulatedFileStatus,
  type SimulatedReport,
  simulatedReportedPaths,
} from "@testing/harnesses/testing/simulated-report";
import { describe, expect, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PYTEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "pytest");
const TEMP_PRODUCT_PREFIX = "spx-pytest-";
const COPIED_SUITE_DIR = ".spx-pytest-cases";
// Copied under a pytest-ignored directory so the l2 test proves explicit test-path forwarding.
const COPIED_SUITE_BASENAME_PREFIX = "test_suite_";
const UV_CACHE_DIR_NAME = ".uv-cache";

export const PYTEST_EXIT_CODE = {
  OK: 0,
  NO_TESTS_COLLECTED: 5,
} as const;

// Committed inert fixture suites copied into a temporary product for the real pytest run.
export const PYTEST_FIXTURE = {
  PASSING: "passing.test_suite.py.fixture",
  FAILING: "failing.test_suite.py.fixture",
  FAILING_ASSERTION: "asserting.test_suite.py.fixture",
} as const;

export type PytestFixture = (typeof PYTEST_FIXTURE)[keyof typeof PYTEST_FIXTURE];

// Records the commands the runner constructs and returns a configured exit code
// (Stage 5 exception 6: observability + exception 1-style controllable result).
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: ReadonlyArray<{ readonly command: string; readonly args: readonly string[] }>;
}

const MALFORMED_REPORT_TEXT = "not a junit report";
const SIMULATED_TEST_NAME = "test_case";

function simulatedJunitText(
  options: {
    readonly exitCode: number;
    readonly report: SimulatedReport;
    readonly reportedStatuses: ReadonlyMap<string, SimulatedFileStatus>;
  },
  testFilePaths: readonly string[],
): string | null {
  if (options.report === SIMULATED_REPORT.MISSING) return null;
  if (options.report === SIMULATED_REPORT.MALFORMED) return MALFORMED_REPORT_TEXT;
  const reported = simulatedReportedPaths(options, testFilePaths);
  const testcases = reported.map((path) => {
    const status = options.reportedStatuses.get(path)
      ?? (options.exitCode === 0 ? TEST_PATH_VERDICT.PASSED : TEST_PATH_VERDICT.FAILED);
    const modulePath = path.endsWith(PYTHON_TEST_FILE_EXTENSION)
      ? path.slice(0, -PYTHON_TEST_FILE_EXTENSION.length)
      : path;
    const classname = modulePath.split("/").join(".");
    const body = status === TEST_PATH_VERDICT.FAILED ? `<failure message="failed"/>` : "";
    return `<testcase classname="${classname}" name="${SIMULATED_TEST_NAME}" time="0.001">${body}</testcase>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?><testsuites><testsuite name="pytest">${
    testcases.join("")
  }</testsuite></testsuites>`;
}

export function createRecordingCommandRunner(options: {
  readonly present: boolean;
  readonly exitCode: number;
  readonly report?: SimulatedReport;
  readonly reportedStatuses?: ReadonlyMap<string, SimulatedFileStatus>;
}): RecordingCommandRunner {
  const calls: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
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
      const reportFlag = args.find((arg) => arg.startsWith(JUNIT_REPORT_FLAG_PREFIX));
      if (reportFlag !== undefined) {
        const text = simulatedJunitText(simulation, args.filter((arg) => arg.endsWith(PYTHON_TEST_FILE_EXTENSION)));
        if (text !== null) reports.set(reportFlag.slice(JUNIT_REPORT_FLAG_PREFIX.length), text);
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
    return pythonTestingLanguage.runTests({ productDir, testPaths, excludedNodePaths: [] }, runner);
  });
}

export const { runWithReportedStatuses, runWithReportedNames } = reportedStatusRunners(runWithSimulatedReport);

// A real command runner that runs `uv` from the temporary product so pytest collects
// from that working directory. The environment must provide pytest before this
// runner executes; the harness does not provision runner dependencies.
export function productRootedPytestCommandRunner(productDir: string): TestRunnerDependencies {
  return {
    isLanguagePresent: () => true,
    runCommand: async (command, args): Promise<TestRunCommandResult> => {
      const result = await execa(command, [...args], {
        cwd: productDir,
        env: { UV_CACHE_DIR: join(productDir, UV_CACHE_DIR_NAME) },
        reject: false,
      });
      return { exitCode: result.exitCode ?? PYTEST_EXIT_CODE.OK };
    },
  };
}

// A temporary pytest product: the temp root and the absolute path of the copied suite the
// runner is asked to execute.
export interface TempPytestProduct {
  readonly productDir: string;
  readonly suitePath: string;
}

// A temporary pytest product holding several suites: the temp root and the absolute path of each
// copied suite, in the order of the fixtures supplied.
export interface TempPytestSuites {
  readonly productDir: string;
  readonly suitePaths: readonly string[];
}

// Copies committed fixture suites into one temporary product outside the repository so pytest resolves
// no inherited configuration, each under a distinct file name so one pytest invocation covers them all.
export function withTempPytestSuites(
  fixtures: readonly PytestFixture[],
  callback: (product: TempPytestSuites) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    const suiteDir = join(productDir, COPIED_SUITE_DIR);
    await mkdir(suiteDir);
    // An empty pytest.ini anchors pytest's rootdir at the product, as a real Python product's configuration does.
    await writeFile(join(productDir, PYTHON_PRODUCT_INPUT_PATH.PYTEST_INI), "");
    const suitePaths: string[] = [];
    for (const [index, fixture] of fixtures.entries()) {
      const suitePath = join(suiteDir, `${COPIED_SUITE_BASENAME_PREFIX}${index}${PYTHON_TEST_FILE_EXTENSION}`);
      await copyFile(join(PYTEST_FIXTURE_DIR, fixture), suitePath);
      suitePaths.push(suitePath);
    }
    await callback({ productDir, suitePaths });
  });
}

// Copies committed fixture suites into a temporary product whose root holds no pytest ini-file while
// an ini-file sits in the directory beside the suites, the nearer position that moves pytest's rootdir
// below the product directory unless the invocation pins it.
export function withTempPytestSuitesUnderNearerIni(
  fixtures: readonly PytestFixture[],
  callback: (product: TempPytestSuites) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    const suiteDir = join(productDir, COPIED_SUITE_DIR);
    await mkdir(suiteDir);
    await writeFile(join(suiteDir, PYTHON_PRODUCT_INPUT_PATH.PYTEST_INI), "");
    const suitePaths: string[] = [];
    for (const [index, fixture] of fixtures.entries()) {
      const suitePath = join(suiteDir, `${COPIED_SUITE_BASENAME_PREFIX}${index}${PYTHON_TEST_FILE_EXTENSION}`);
      await copyFile(join(PYTEST_FIXTURE_DIR, fixture), suitePath);
      suitePaths.push(suitePath);
    }
    await callback({ productDir, suitePaths });
  });
}

// Copies a committed fixture suite into a temporary product outside the repository so pytest resolves
// no inherited configuration, and hands back the suite path for the runner to execute.
export function withTempPytestProduct(
  fixture: PytestFixture,
  callback: (product: TempPytestProduct) => Promise<void>,
): Promise<void> {
  return withTempPytestSuites([fixture], async ({ productDir, suitePaths }) => {
    const [suitePath] = suitePaths;
    await callback({ productDir, suitePath });
  });
}

/** Where the pytest ini-file sits relative to the copied suites of a real pytest run. */
export const PYTEST_INI_PLACEMENT = {
  /** At the product root, anchoring pytest's rootdir there. */
  PRODUCT_ROOT: "pytest-ini-at-product-root",
  /** Beside the suites, nearer to them than the product root. */
  BESIDE_SUITES: "pytest-ini-beside-suites",
} as const;

export type PytestIniPlacement = (typeof PYTEST_INI_PLACEMENT)[keyof typeof PYTEST_INI_PLACEMENT];

export interface RealPytestRun {
  /** The absolute path of each copied suite, in the order of the fixtures supplied. */
  readonly suitePaths: readonly string[];
  /** What the Python testing language returned for the run over every suite in one pytest invocation. */
  readonly result: Awaited<ReturnType<typeof pythonTestingLanguage.runTests>>;
}

/**
 * A real pytest run over the supplied committed fixture suites with the product-rooted runner,
 * in one invocation over every suite; the linked test owns every predicate over the outcome.
 */
export async function runRealPytestOverSuites(
  fixtures: readonly PytestFixture[],
  iniPlacement: PytestIniPlacement = PYTEST_INI_PLACEMENT.PRODUCT_ROOT,
): Promise<RealPytestRun> {
  const withSuites = iniPlacement === PYTEST_INI_PLACEMENT.PRODUCT_ROOT
    ? withTempPytestSuites
    : withTempPytestSuitesUnderNearerIni;
  let run: RealPytestRun | undefined;

  await withSuites(fixtures, async ({ productDir, suitePaths }) => {
    const result = await pythonTestingLanguage.runTests(
      { productDir, testPaths: suitePaths, excludedNodePaths: [] },
      productRootedPytestCommandRunner(productDir),
    );
    run = { suitePaths, result };
  });

  assert(run !== undefined);
  return run;
}

export function registerPythonRunnerScenarioL1Evidence(): void {
  describe("python test runner invocation", () => {
    it("invokes pytest with an ignore flag for each excluded node", async () => {
      const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths());
      const excludedNodePaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.nodePaths());
      const exitCode = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.exitCode());
      const runner = createRecordingCommandRunner({ present: true, exitCode });

      const result = await pythonTestingLanguage.runTests({ productDir, testPaths, excludedNodePaths }, runner);

      expect(result.invoked).toBe(true);
      expect(runner.calls).toHaveLength(1);
      expect(runner.calls[0]?.command).toBe(UV_COMMAND);
      const invokedArgs = runner.calls[0]?.args ?? [];
      expect(invokedArgs.slice(0, PYTEST_INVOKE_ARGS.length)).toEqual([...PYTEST_INVOKE_ARGS]);
      for (const testPath of testPaths) expect(invokedArgs).toContain(testPath);
      for (const nodePath of excludedNodePaths) {
        expect(invokedArgs).toContain(pythonTestingLanguage.excludeFlag(nodePath));
      }
    });

    it("does not invoke pytest when Python is absent", async () => {
      const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.testPaths());
      const exitCode = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.exitCode());
      const runner = createRecordingCommandRunner({ present: false, exitCode });

      const result = await pythonTestingLanguage.runTests({ productDir, testPaths, excludedNodePaths: [] }, runner);

      expect(result.invoked).toBe(false);
      expect(runner.calls).toHaveLength(0);
    });

    it("propagates the command runner exit code when pytest is invoked", async () => {
      await assertProperty(
        fc.tuple(PYTHON_RUNNER_TEST_GENERATOR.exitCode(), CONFIG_TEST_GENERATOR.productDir()),
        async ([exitCode, productDir]) => {
          const runner = createRecordingCommandRunner({ present: true, exitCode });
          const result = await pythonTestingLanguage.runTests(
            { productDir, testPaths: [], excludedNodePaths: [] },
            runner,
          );

          expect(result.invoked).toBe(true);
          assert(result.invoked);
          expect(result.exitCode).toBe(exitCode);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}

export function registerPythonRunnerScenarioL2Evidence(): void {
  describe("python test runner drives real pytest", () => {
    it("invokes pytest against a passing product and exits zero", async () => {
      await withTempPytestProduct(PYTEST_FIXTURE.PASSING, async ({ productDir, suitePath }) => {
        const result = await pythonTestingLanguage.runTests(
          { productDir, testPaths: [suitePath], excludedNodePaths: [] },
          productRootedPytestCommandRunner(productDir),
        );

        expect(result.invoked).toBe(true);
        assert(result.invoked);
        expect(result.exitCode).toBe(PYTEST_EXIT_CODE.OK);
      });
    });

    it("invokes pytest against a product with a missing import and exits non-zero", async () => {
      await withTempPytestProduct(PYTEST_FIXTURE.FAILING, async ({ productDir, suitePath }) => {
        const result = await pythonTestingLanguage.runTests(
          { productDir, testPaths: [suitePath], excludedNodePaths: [] },
          productRootedPytestCommandRunner(productDir),
        );

        expect(result.invoked).toBe(true);
        assert(result.invoked);
        expect(result.exitCode).not.toBe(PYTEST_EXIT_CODE.OK);
        expect(result.exitCode).not.toBe(PYTEST_EXIT_CODE.NO_TESTS_COLLECTED);
      });
    });
  });
}

export function registerPythonRunnerComplianceEvidence(): void {
  describe("python test runner gating on Python presence", () => {
    it("ALWAYS: invokes pytest exactly when Python is present", async () => {
      await assertProperty(
        fc.tuple(PYTHON_RUNNER_TEST_GENERATOR.invocationGateScenario(), CONFIG_TEST_GENERATOR.productDir()),
        async ([{ present, exitCode }, productDir]) => {
          const runner = createRecordingCommandRunner({ present, exitCode });
          const result = await pythonTestingLanguage.runTests(
            { productDir, testPaths: [], excludedNodePaths: [] },
            runner,
          );

          expect(result.invoked).toBe(present);
          expect(runner.calls).toHaveLength(present ? 1 : 0);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("ALWAYS: detect reflects the injected Python presence predicate", () => {
      assertProperty(
        fc.tuple(PYTHON_RUNNER_TEST_GENERATOR.present(), CONFIG_TEST_GENERATOR.productDir()),
        ([present, productDir]) => {
          expect(pythonTestingLanguage.detect(productDir, { isLanguagePresent: () => present })).toBe(present);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("ALWAYS: detect falls back to marker-based Python detection without an override", async () => {
      await withTestingTempProductDir(async (productDir) => {
        expect(pythonTestingLanguage.detect(productDir)).toBe(false);
        await writeFile(join(productDir, PYTHON_MARKER), "");
        expect(pythonTestingLanguage.detect(productDir)).toBe(true);
      });
    });
  });
}

export interface TempPytestProductObservation {
  /** The product directory the callback received. */
  readonly productDir: string;
  /** The suite path the callback received. */
  readonly suitePath: string;
  /** Whether the suite path existed while the callback ran. */
  readonly suiteExistedDuringCallback: boolean;
  /** Whether the product directory still exists once the callback has settled. */
  readonly productExistsAfterCallback: boolean;
  /** Whether the suite path still exists once the callback has settled. */
  readonly suiteExistsAfterCallback: boolean;
}

// Runs a callback through `withTempPytestProduct` and reports what the product looked like
// during the callback and whether it survived it; the linked test owns every predicate.
export async function observeTempPytestProductLifecycle(
  fixture: PytestFixture,
): Promise<TempPytestProductObservation> {
  let productDir = "";
  let suitePath = "";
  let suiteExistedDuringCallback = false;

  await withTempPytestProduct(fixture, async (product) => {
    productDir = product.productDir;
    suitePath = product.suitePath;
    suiteExistedDuringCallback = await pathExists(product.suitePath);
  });

  return {
    productDir,
    suitePath,
    suiteExistedDuringCallback,
    productExistsAfterCallback: await pathExists(productDir),
    suiteExistsAfterCallback: await pathExists(suitePath),
  };
}

export interface TempPytestProductFailureObservation {
  /** Whether the product directory existed when the callback threw. */
  readonly existedDuringCallback: boolean;
  /** Whether the product directory still exists once the failed callback has settled. */
  readonly existsAfterCallback: boolean;
  /** What `withTempPytestProduct` rejected with. */
  readonly rejection: unknown;
}

// Runs a throwing callback through `withTempPytestProduct` and reports the product's existence
// around the throw and the rejection the caller observes.
export async function observeTempPytestProductAfterThrow(
  fixture: PytestFixture,
  failure: Error,
): Promise<TempPytestProductFailureObservation> {
  let productDir = "";
  let existedDuringCallback = false;
  let rejection: unknown;

  try {
    await withTempPytestProduct(fixture, async (product) => {
      productDir = product.productDir;
      existedDuringCallback = await pathExists(product.productDir);
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
