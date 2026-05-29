import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { pythonTestingLanguage } from "@/testing/languages/python";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { PYTHON_RUNNER_TEST_GENERATOR, samplePythonRunnerValue } from "@testing/generators/testing/python-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/python-runner";

describe("python test runner invocation", () => {
  it("invokes pytest with an ignore flag for each excluded node", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.testPaths());
    const excludedNodePaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.nodePaths());
    const exitCode = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.exitCode());
    const runner = createRecordingCommandRunner({ present: true, exitCode });

    const result = await pythonTestingLanguage.runTests(
      { projectRoot, testPaths, excludedNodePaths },
      runner,
    );

    expect(result.invoked).toBe(true);
    expect(runner.calls).toHaveLength(1);
    const invokedArgs = runner.calls[0]?.args ?? [];
    for (const nodePath of excludedNodePaths) {
      expect(invokedArgs).toContain(pythonTestingLanguage.excludeFlag(nodePath));
    }
  });

  it("does not invoke pytest when Python is absent", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const testPaths = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.testPaths());
    const exitCode = samplePythonRunnerValue(PYTHON_RUNNER_TEST_GENERATOR.exitCode());
    const runner = createRecordingCommandRunner({ present: false, exitCode });

    const result = await pythonTestingLanguage.runTests(
      { projectRoot, testPaths, excludedNodePaths: [] },
      runner,
    );

    expect(result.invoked).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });

  it("propagates the command runner exit code when pytest is invoked", async () => {
    await fc.assert(
      fc.asyncProperty(PYTHON_RUNNER_TEST_GENERATOR.exitCode(), async (exitCode) => {
        const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
        const runner = createRecordingCommandRunner({ present: true, exitCode });

        const result = await pythonTestingLanguage.runTests(
          { projectRoot, testPaths: [], excludedNodePaths: [] },
          runner,
        );

        expect(result.exitCode).toBe(exitCode);
      }),
    );
  });
});
