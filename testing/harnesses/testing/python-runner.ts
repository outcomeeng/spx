import { execa } from "execa";
import assert from "node:assert";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { pythonTestingLanguage } from "@/test/languages/python";
import { PYTEST_INVOKE_ARGS, UV_COMMAND } from "@/test/languages/python-pytest-contract";
import type { TestRunCommandResult, TestRunnerDependencies } from "@/test/languages/types";
import { PYTHON_MARKER } from "@/validation/discovery/language-finder";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryDomainLiteral, sampleLiteralTestValue } from "@testing/generators/literal/literal";
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

export function createRecordingCommandRunner(options: {
  readonly present: boolean;
  readonly exitCode: number;
}): RecordingCommandRunner {
  const calls: Array<{ readonly command: string; readonly args: readonly string[] }> = [];
  return {
    calls,
    isLanguagePresent: () => options.present,
    runCommand: (command, args) => {
      calls.push({ command, args });
      return Promise.resolve({ exitCode: options.exitCode });
    },
  };
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

export function registerTempPytestProductScenarioEvidence(): void {
  describe("withTempPytestProduct", () => {
    it("materializes the fixture suite under the OS temp root and removes the product after the callback returns", async () => {
      const tempRootPrefix = resolve(tmpdir()) + sep;
      let capturedProductDir = "";
      let capturedSuitePath = "";

      await withTempPytestProduct(PYTEST_FIXTURE.PASSING, async ({ productDir, suitePath }) => {
        capturedProductDir = productDir;
        capturedSuitePath = suitePath;

        expect(resolve(productDir).startsWith(tempRootPrefix)).toBe(true);
        expect(suitePath.startsWith(productDir)).toBe(true);
        expect(await pathExists(suitePath)).toBe(true);
      });

      expect(await pathExists(capturedProductDir)).toBe(false);
      expect(await pathExists(capturedSuitePath)).toBe(false);
    });

    it("removes the product and rethrows the original error when the callback throws", async () => {
      let capturedProductDir = "";
      const failure = new Error(sampleLiteralTestValue(arbitraryDomainLiteral()));

      await expect(
        withTempPytestProduct(PYTEST_FIXTURE.FAILING, async ({ productDir }) => {
          capturedProductDir = productDir;
          expect(await pathExists(productDir)).toBe(true);
          throw failure;
        }),
      ).rejects.toBe(failure);

      expect(await pathExists(capturedProductDir)).toBe(false);
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
