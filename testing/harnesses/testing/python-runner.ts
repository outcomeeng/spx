import { execa } from "execa";
import assert from "node:assert";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { pythonTestingLanguage } from "@/test/languages/python";
import { PYTEST_INVOKE_ARGS, UV_COMMAND } from "@/test/languages/python-pytest-contract";
import type { TestRunCommandResult, TestRunnerDependencies } from "@/test/languages/types";
import { TEST_PATH_VERDICT } from "@/test/run-state";
import { PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { withTestingTempProductDir } from "@testing/harnesses/testing/harness";
import { describe, expect, it } from "@testing/harnesses/vitest-registration";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PYTEST_FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "fixtures", "pytest");
const TEMP_PRODUCT_PREFIX = "spx-pytest-";
const COPIED_SUITE_DIR = ".spx-pytest-cases";
// Copied under a pytest-ignored directory so the l2 test proves explicit test-path forwarding.
const COPIED_SUITE_NAME = "test_suite.py";
const UV_CACHE_DIR_NAME = ".uv-cache";

export const PYTEST_EXIT_CODE = {
  OK: 0,
  NO_TESTS_COLLECTED: 5,
} as const;

// Committed inert fixture suites copied into a temporary product for the real pytest run.
export const PYTEST_FIXTURE = {
  PASSING: "passing.test_suite.py.fixture",
  FAILING: "failing.test_suite.py.fixture",
} as const;

export type PytestFixture = (typeof PYTEST_FIXTURE)[keyof typeof PYTEST_FIXTURE];

// Records the commands the runner constructs and returns a configured exit code
// (Stage 5 exception 6: observability + exception 1-style controllable result).
export interface RecordingCommandRunner extends TestRunnerDependencies {
  readonly calls: ReadonlyArray<{ readonly command: string; readonly args: readonly string[] }>;
}

/** How a recording runner's simulated pytest invocation leaves its JUnit XML report. */
export const SIMULATED_REPORT = {
  /** Every supplied test file is reported with the status the exit code implies. */
  FOLLOWS_EXIT_CODE: "follows-exit-code",
  /** Only the files in `reportedStatuses` are reported; the rest are omitted. */
  LISTED_FILES: "listed-files",
  /** No report file exists once the invocation exits. */
  MISSING: "missing",
  /** The report file holds text that is not a JUnit XML report. */
  MALFORMED: "malformed",
} as const;

export type SimulatedReport = (typeof SIMULATED_REPORT)[keyof typeof SIMULATED_REPORT];

export type SimulatedFileStatus = typeof TEST_PATH_VERDICT.PASSED | typeof TEST_PATH_VERDICT.FAILED;

const JUNIT_FLAG_PREFIX = "--junitxml=";
const MALFORMED_REPORT_TEXT = "not a junit report";
const SIMULATED_REPORT_ABSENT_MESSAGE = "no simulated report at";
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
  const reported = options.report === SIMULATED_REPORT.LISTED_FILES
    ? testFilePaths.filter((path) => options.reportedStatuses.has(path))
    : testFilePaths;
  const testcases = reported.map((path) => {
    const status = options.reportedStatuses.get(path)
      ?? (options.exitCode === 0 ? TEST_PATH_VERDICT.PASSED : TEST_PATH_VERDICT.FAILED);
    const classname = path.replace(/\.py$/, "").split("/").join(".");
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
      const reportFlag = args.find((arg) => arg.startsWith(JUNIT_FLAG_PREFIX));
      if (reportFlag !== undefined) {
        const text = simulatedJunitText(simulation, args.filter((arg) => arg.endsWith(".py")));
        if (text !== null) reports.set(reportFlag.slice(JUNIT_FLAG_PREFIX.length), text);
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

async function runWithSimulatedReport(
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

export function registerPythonRunnerVerdictScenarioTests(): void {
  describe("python test runner reports a verdict per test path from pytest's JUnit XML report", () => {
    it("reports failed for the failing path and passed for the passing path of one invocation", async () => {
      const [failingPath, passingPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

      const invocation = await runWithSimulatedReport(
        {
          exitCode: 1,
          report: SIMULATED_REPORT.LISTED_FILES,
          reportedStatuses: new Map<string, SimulatedFileStatus>([
            [failingPath, TEST_PATH_VERDICT.FAILED],
            [passingPath, TEST_PATH_VERDICT.PASSED],
          ]),
        },
        [failingPath, passingPath],
      );

      expect(invocation).toMatchObject({
        invoked: true,
        exitCode: 1,
        pathVerdicts: [
          { testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED },
          { testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED },
        ],
      });
    });

    it("reports not-run for a supplied path the report omits", async () => {
      const [reportedPath, omittedPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

      const invocation = await runWithSimulatedReport(
        {
          exitCode: 0,
          report: SIMULATED_REPORT.LISTED_FILES,
          reportedStatuses: new Map<string, SimulatedFileStatus>([[reportedPath, TEST_PATH_VERDICT.PASSED]]),
        },
        [reportedPath, omittedPath],
      );

      expect(invocation).toMatchObject({
        invoked: true,
        pathVerdicts: [
          { testPath: reportedPath, verdict: TEST_PATH_VERDICT.PASSED },
          { testPath: omittedPath, verdict: TEST_PATH_VERDICT.NOT_RUN },
        ],
      });
    });

    it.each([SIMULATED_REPORT.MISSING, SIMULATED_REPORT.MALFORMED])(
      "reports no verdict and a failed outcome when the report is %s",
      async (report) => {
        const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

        const invocation = await runWithSimulatedReport({ exitCode: 0, report }, testPaths);

        expect(invocation.invoked).toBe(true);
        if (!invocation.invoked) return;
        expect(invocation.exitCode).not.toBe(0);
        expect(invocation.pathVerdicts).toBeUndefined();
      },
    );
  });
}

export function registerPythonRunnerVerdictComplianceTests(): void {
  describe("python test runner derives path verdicts from the report, never the exit code", () => {
    it("reports a path passed when the report passes it though the process exits non-zero", async () => {
      await assertProperty(
        PYTHON_RUNNER_TEST_GENERATOR.nonZeroExitCode(),
        async (exitCode) => {
          const [passingPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

          const invocation = await runWithSimulatedReport(
            {
              exitCode,
              report: SIMULATED_REPORT.LISTED_FILES,
              reportedStatuses: new Map<string, SimulatedFileStatus>([[passingPath, TEST_PATH_VERDICT.PASSED]]),
            },
            [passingPath],
          );

          expect(invocation).toMatchObject({
            pathVerdicts: [{ testPath: passingPath, verdict: TEST_PATH_VERDICT.PASSED }],
          });
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("reports a path failed when the report fails it though the process exits zero", async () => {
      const [failingPath] = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.distinctTestPathPair());

      const invocation = await runWithSimulatedReport(
        {
          exitCode: 0,
          report: SIMULATED_REPORT.LISTED_FILES,
          reportedStatuses: new Map<string, SimulatedFileStatus>([[failingPath, TEST_PATH_VERDICT.FAILED]]),
        },
        [failingPath],
      );

      expect(invocation).toMatchObject({
        pathVerdicts: [{ testPath: failingPath, verdict: TEST_PATH_VERDICT.FAILED }],
      });
    });
  });
}

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

// Copies a committed fixture suite into a temporary product outside the repository so pytest resolves
// no inherited configuration, and hands back the suite path for the runner to execute.
export function withTempPytestProduct(
  fixture: PytestFixture,
  callback: (product: TempPytestProduct) => Promise<void>,
): Promise<void> {
  return withTempDir(TEMP_PRODUCT_PREFIX, async (productDir) => {
    const suiteDir = join(productDir, COPIED_SUITE_DIR);
    const suitePath = join(suiteDir, COPIED_SUITE_NAME);
    await mkdir(suiteDir);
    await copyFile(join(PYTEST_FIXTURE_DIR, fixture), suitePath);
    await callback({ productDir, suitePath });
  });
}

export function registerPythonRunnerScenarioL1Evidence(): void {
  registerPythonRunnerVerdictScenarioTests();
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
        PYTHON_RUNNER_TEST_GENERATOR.exitCode(),
        async (exitCode) => {
          const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
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
  registerPythonRunnerVerdictComplianceTests();
  describe("python test runner gating on Python presence", () => {
    it("ALWAYS: invokes pytest exactly when Python is present", async () => {
      await assertProperty(
        PYTHON_RUNNER_TEST_GENERATOR.invocationGateScenario(),
        async ({ present, exitCode }) => {
          const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
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
        PYTHON_RUNNER_TEST_GENERATOR.present(),
        (present) => {
          const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
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
