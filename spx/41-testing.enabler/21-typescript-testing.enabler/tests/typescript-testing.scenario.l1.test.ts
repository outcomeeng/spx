import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  sampleTypescriptRunnerValue,
  TYPESCRIPT_RUNNER_TEST_GENERATOR,
} from "@testing/generators/testing/typescript-runner";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

describe("typescript test runner invocation", () => {
  it("invokes vitest with an exclusion flag for each excluded node", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const testPaths = sampleTypescriptRunnerValue(TYPESCRIPT_RUNNER_TEST_GENERATOR.testPaths());
    const excludedNodePaths = sampleTypescriptRunnerValue(TYPESCRIPT_RUNNER_TEST_GENERATOR.nodePaths());
    const exitCode = sampleTypescriptRunnerValue(TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode());
    const runner = createRecordingCommandRunner({ present: true, exitCode });

    const result = await typescriptTestingLanguage.runTests(
      { projectRoot, testPaths, excludedNodePaths },
      runner,
    );

    expect(result.invoked).toBe(true);
    expect(runner.calls).toHaveLength(1);
    const invokedArgs = runner.calls[0]?.args ?? [];
    for (const nodePath of excludedNodePaths) {
      expect(invokedArgs).toContain(typescriptTestingLanguage.excludeFlag(nodePath));
    }
  });

  it("does not invoke vitest when TypeScript is absent", async () => {
    const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const testPaths = sampleTypescriptRunnerValue(TYPESCRIPT_RUNNER_TEST_GENERATOR.testPaths());
    const exitCode = sampleTypescriptRunnerValue(TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode());
    const runner = createRecordingCommandRunner({ present: false, exitCode });

    const result = await typescriptTestingLanguage.runTests(
      { projectRoot, testPaths, excludedNodePaths: [] },
      runner,
    );

    expect(result.invoked).toBe(false);
    expect(runner.calls).toHaveLength(0);
  });

  it("propagates the command runner exit code when vitest is invoked", async () => {
    await fc.assert(
      fc.asyncProperty(TYPESCRIPT_RUNNER_TEST_GENERATOR.exitCode(), async (exitCode) => {
        const projectRoot = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
        const runner = createRecordingCommandRunner({ present: true, exitCode });

        const result = await typescriptTestingLanguage.runTests(
          { projectRoot, testPaths: [], excludedNodePaths: [] },
          runner,
        );

        if (!result.invoked) throw new Error();
        expect(result.exitCode).toBe(exitCode);
      }),
    );
  });
});
