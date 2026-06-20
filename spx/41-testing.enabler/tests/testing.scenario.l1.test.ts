import { describe, expect, it } from "vitest";

import { type RecordedTestRun, runTests, type TestDispatchResult } from "@/commands/testing";
import {
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/testing";
import { TESTING_CLI } from "@/interfaces/cli/testing";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { pythonTestingLanguage } from "@/testing/languages/python";
import type { TestingLanguageDescriptor } from "@/testing/languages/types";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import { testingRegistry } from "@/testing/registry";
import { TEST_RUN_STATE_FIELDS, TEST_RUN_STATE_STATUS } from "@/testing/run-state";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { runTestingCli, type TestingCliCall, testingCliDeps } from "@testing/harnesses/testing/cli";
import { withTestingTempProductDir, writeTestFileFixture } from "@testing/harnesses/testing/harness";
import { createRecordingCommandRunner } from "@testing/harnesses/testing/typescript-runner";

function invokedArgs(
  runner: { readonly calls: ReadonlyArray<{ readonly args: readonly string[] }> },
): readonly string[] {
  return runner.calls.flatMap((call) => call.args);
}

function recordedPassingRun(productDir: string, run: TestDispatchResult): RecordedTestRun {
  return {
    dispatch: run,
    runFile: {
      runsDir: productDir,
      runFilePath: productDir,
      runFileName: productDir,
      runToken: productDir,
      runId: productDir,
      startedAt: productDir,
    },
    recorded: {
      branchName: productDir,
      headSha: productDir,
      testingConfigDigest: productDir,
      runnerOutcomes: [],
      discoveredTestPathsDigest: productDir,
      discoveredTestContentDigest: productDir,
      productInputDigests: [],
      startedAt: productDir,
      completedAt: productDir,
      [TEST_RUN_STATE_FIELDS.STATUS]: TEST_RUN_STATE_STATUS.PASSED,
    },
  };
}

describe("spx test dispatch over the language registry", () => {
  it("invokes each language's runner on the files matching its registered extension", async () => {
    const [tsNode, pyNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const tsFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, tsNode));
    const pyFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, pyNode));
    const tsRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
    const pyRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, tsFile);
      await writeTestFileFixture(productDir, pyFile);

      await runTests({ productDir, registry: testingRegistry }, {
        runnerDepsFor: (language: TestingLanguageDescriptor) =>
          language === typescriptTestingLanguage ? tsRunner : pyRunner,
      });

      expect(invokedArgs(tsRunner)).toContain(tsFile);
      expect(invokedArgs(pyRunner)).toContain(pyFile);
    });
  });

  it("reports, skips, and fails test files matching no registered runner", async () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const matchedFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const unmatchedFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.unmatchedTestFileUnder(nodePath));
    const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, matchedFile);
      await writeTestFileFixture(productDir, unmatchedFile);

      const result = await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => runner });

      expect(result.exitCode).toBe(UNSUPPORTED_TEST_SELECTION_EXIT_CODE);
      expect(result.unmatched).toContain(unmatchedFile);
      expect(invokedArgs(runner)).not.toContain(unmatchedFile);
    });
  });

  it("reports a co-located non-test source file as unmatched and fails", async () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const testFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const supportFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.supportFileUnder(typescriptTestingLanguage, nodePath),
    );
    const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, testFile);
      await writeTestFileFixture(productDir, supportFile);

      const result = await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => runner });

      expect(result.unmatched).toContain(supportFile);
      expect(result.exitCode).toBe(UNSUPPORTED_TEST_SELECTION_EXIT_CODE);
      expect(invokedArgs(runner)).toContain(testFile);
      expect(invokedArgs(runner)).not.toContain(supportFile);
    });
  });

  it("exits non-zero when any dispatched runner exits non-zero", async () => {
    const [tsNode, pyNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const tsFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, tsNode));
    const pyFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, pyNode));
    const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
    const passingRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
    const failingRunner = createRecordingCommandRunner({ present: true, exitCode: failingExitCode });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, tsFile);
      await writeTestFileFixture(productDir, pyFile);

      const result = await runTests({ productDir, registry: testingRegistry }, {
        runnerDepsFor: (language: TestingLanguageDescriptor) =>
          language === typescriptTestingLanguage ? passingRunner : failingRunner,
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  it("skips an absent language's runner and aggregates from the present ones", async () => {
    const [presentNode, absentNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const presentFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, presentNode),
    );
    const absentFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, absentNode));
    const absentExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
    const presentRunner = createRecordingCommandRunner({ present: true, exitCode: 0 });
    const absentRunner = createRecordingCommandRunner({ present: false, exitCode: absentExitCode });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, presentFile);
      await writeTestFileFixture(productDir, absentFile);

      const result = await runTests({ productDir, registry: testingRegistry }, {
        runnerDepsFor: (language: TestingLanguageDescriptor) =>
          language === typescriptTestingLanguage ? presentRunner : absentRunner,
      });

      // The absent language's runner is gated out — never invoked — so its
      // configured non-zero exit code cannot leak into the aggregate.
      expect(absentRunner.calls).toHaveLength(0);
      expect(invokedArgs(presentRunner)).toContain(presentFile);
      expect(result.exitCode).toBe(0);
    });
  });

  it("reports absent selected runner groups for passing operator-mode runs", async () => {
    const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const reportedPath = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
    );
    const gatedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedPassingRun(productDir, {
      exitCode: SUCCESS_EXIT_CODE,
      groups: [{
        language: typescriptTestingLanguage,
        testPaths: [reportedPath],
      }, {
        language: pythonTestingLanguage,
        testPaths: [gatedPath],
      }],
      unmatched: [],
      unresolvedTargets: [],
      reports: [{
        runnerId: typescriptTestingLanguage.name,
        testPaths: [reportedPath],
        exitCode: SUCCESS_EXIT_CODE,
      }],
      outcomes: [],
    });

    const result = await runTestingCli([
      TESTING_CLI.commandName,
      TESTING_CLI.passingSubcommand,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(agentCalls).toEqual([]);
    expect(streamCalls).toEqual([{ productDir, passing: true }]);
    expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
    expect(result.stderr).toContain(pythonTestingLanguage.name);
    expect(result.stderr).toContain(gatedPath);
    expect(result.stderr).not.toContain(reportedPath);
  });

  it("reports absent selected runner groups for failing operator-mode runs", async () => {
    const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const selectedPath = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
    );
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedPassingRun(productDir, {
      exitCode: NO_RUNNER_INVOCATION_EXIT_CODE,
      groups: [{
        language: typescriptTestingLanguage,
        testPaths: [selectedPath],
      }],
      unmatched: [],
      unresolvedTargets: [],
      reports: [],
      outcomes: [],
    });

    const result = await runTestingCli([
      TESTING_CLI.commandName,
      TESTING_CLI.passingSubcommand,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(agentCalls).toEqual([]);
    expect(streamCalls).toEqual([{ productDir, passing: true }]);
    expect(result.exitCodes).toEqual([NO_RUNNER_INVOCATION_EXIT_CODE]);
    expect(result.stderr).toContain(typescriptTestingLanguage.name);
    expect(result.stderr).toContain(selectedPath);
  });

  it("fails when every selected language runner is absent", async () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const selectedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
    );
    const absentExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
    const absentRunner = createRecordingCommandRunner({ present: false, exitCode: absentExitCode });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, selectedFile);

      const result = await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => absentRunner });

      expect(absentRunner.calls).toHaveLength(0);
      expect(result.exitCode).toBe(NO_RUNNER_INVOCATION_EXIT_CODE);
    });
  });

  it("filters a passing-scope-excluded node's files before runner invocation", async () => {
    const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const excludedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
    );
    const includedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
    );
    const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });
    const passingScope = { exclude: [`${SPEC_TREE_CONFIG.ROOT_DIRECTORY}/${excludedNode}`] };

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, excludedFile);
      await writeTestFileFixture(productDir, includedFile);

      await runTests({ productDir, registry: testingRegistry, passingScope }, { runnerDepsFor: () => runner });

      expect(invokedArgs(runner)).not.toContain(excludedFile);
      expect(invokedArgs(runner)).toContain(includedFile);
    });
  });

  it("runs a would-be-excluded node's files when no passing scope is applied", async () => {
    const [excludedNode, includedNode] = sampleDispatchValue(TEST_DISPATCH_GENERATOR.distinctNodePaths());
    const excludedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, excludedNode),
    );
    const includedFile = sampleDispatchValue(
      TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, includedNode),
    );
    const runner = createRecordingCommandRunner({ present: true, exitCode: 0 });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, excludedFile);
      await writeTestFileFixture(productDir, includedFile);

      await runTests({ productDir, registry: testingRegistry }, { runnerDepsFor: () => runner });

      expect(invokedArgs(runner)).toContain(excludedFile);
      expect(invokedArgs(runner)).toContain(includedFile);
    });
  });
});
