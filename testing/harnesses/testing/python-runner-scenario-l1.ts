import { pythonTestingLanguage } from "@/test/languages/python";
import { PYTEST_INVOKE_ARGS, UV_COMMAND } from "@/test/languages/python-pytest-contract";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";
import { collectHarnessTestCases, describe, expect, it } from "@testing/harnesses/vitest-registration";

export function registerPythonRunnerScenarioL1(): void {
  describe("python test runner invocation", () => {
    it("invokes pytest with an ignore flag for each excluded node", async () => {
      const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.nonEmptyTestPaths());
      const excludedNodePaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.nodePaths());
      const exitCode = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.exitCode());
      const runner = createRecordingCommandRunner({ present: true, exitCode });

      const result = await pythonTestingLanguage.runTests(
        { productDir, testPaths, excludedNodePaths },
        runner,
      );

      expect(result.invoked).toBe(true);
      expect(runner.calls).toHaveLength(1);
      expect(runner.calls[0]?.command).toBe(UV_COMMAND);
      const invokedArgs = runner.calls[0]?.args ?? [];
      expect(invokedArgs.slice(0, PYTEST_INVOKE_ARGS.length)).toEqual([...PYTEST_INVOKE_ARGS]);
      for (const testPath of testPaths) {
        expect(invokedArgs).toContain(testPath);
      }
      for (const nodePath of excludedNodePaths) {
        expect(invokedArgs).toContain(pythonTestingLanguage.excludeFlag(nodePath));
      }
    });

    it("does not invoke pytest when Python is absent", async () => {
      const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
      const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.testPaths());
      const exitCode = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.exitCode());
      const runner = createRecordingCommandRunner({ present: false, exitCode });

      const result = await pythonTestingLanguage.runTests(
        { productDir, testPaths, excludedNodePaths: [] },
        runner,
      );

      expect(result.invoked).toBe(false);
      expect(runner.calls).toHaveLength(0);
    });

    it("propagates the command runner exit code when pytest is invoked", async () => {
      await assertProperty(
        PYTHON_RUNNER_TEST_GENERATOR.exitCode(),
        async (exitCode) => {
          const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
          const runner = createRecordingCommandRunner({ present: true, exitCode });

          // Exit-code propagation is independent of the forwarded paths, so this invariant uses empty testPaths.
          const result = await pythonTestingLanguage.runTests(
            { productDir, testPaths: [], excludedNodePaths: [] },
            runner,
          );

          expect(result.invoked).toBe(true);
          if (result.invoked) expect(result.exitCode).toBe(exitCode);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}

export const pythonRunnerScenarioL1Cases = collectHarnessTestCases(registerPythonRunnerScenarioL1);
