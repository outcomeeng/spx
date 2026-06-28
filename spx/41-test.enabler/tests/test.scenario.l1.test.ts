import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHANGED_TEST_RELATED_DEPS_ERROR,
  type RecordedTestRun,
  runTests,
  runTestsCommand,
  type TestDispatchResult,
} from "@/commands/test";
import {
  CHANGED_TEST_DIFF_CACHED_FLAG,
  CHANGED_TEST_DIFF_COMMAND,
  CHANGED_TEST_DIFF_NAME_STATUS_FLAG,
  CHANGED_TEST_SHOW_COMMAND,
} from "@/commands/test/changed-set-planning";
import { CONFIG_FILENAMES } from "@/config/index";
import {
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/test";
import type { GitDependencies } from "@/git/root";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { GIT_MODIFY_STATUS_EXAMPLE } from "@/lib/git/name-status";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree/config";
import { TESTING_SECTION } from "@/test/config";
import { pythonTestingLanguage } from "@/test/languages/python";
import type { TestingLanguageDescriptor } from "@/test/languages/types";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import { testingRegistry } from "@/test/registry";
import { TEST_RUN_STATE_FIELDS, TEST_RUN_STATE_STATUS } from "@/test/run-state";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { GIT_TEST_REF, GIT_TEST_SUBCOMMANDS } from "@testing/harnesses/git-test-constants";
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

function stagedConfigChangeGit(
  headSha: string,
  stagedConfig: string,
  changedPath: string = CONFIG_FILENAMES.yaml,
): GitDependencies {
  return {
    execa: async (_command, args) => {
      if (args.includes(GIT_TEST_SUBCOMMANDS.REV_PARSE)) {
        return { exitCode: 0, stdout: headSha, stderr: "" };
      }
      if (
        args.includes(CHANGED_TEST_DIFF_COMMAND)
        && args.includes(CHANGED_TEST_DIFF_CACHED_FLAG)
        && args.includes(CHANGED_TEST_DIFF_NAME_STATUS_FLAG)
      ) {
        return {
          exitCode: 0,
          stdout: [GIT_MODIFY_STATUS_EXAMPLE, changedPath].join("\0") + "\0",
          stderr: "",
        };
      }
      if (args.includes(CHANGED_TEST_SHOW_COMMAND) && args.includes(`:${CONFIG_FILENAMES.yaml}`)) {
        return { exitCode: 0, stdout: stagedConfig, stderr: "" };
      }
      if (args.includes(CHANGED_TEST_SHOW_COMMAND)) {
        return { exitCode: 1, stdout: "", stderr: "not in index" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
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

  it("reports unresolved changed source files without failing a passing run", async () => {
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const testFile = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });

    await withTestingTempProductDir(async (productDir) => {
      await writeTestFileFixture(productDir, testFile);

      const result = await runTests(
        {
          productDir,
          registry: testingRegistry,
          targets: { operands: [testFile], recursive: false },
          unresolvedChangedSourceFiles: [unresolvedSourcePath],
        },
        { runnerDepsFor: () => runner },
      );

      expect(result.exitCode).toBe(SUCCESS_EXIT_CODE);
      expect(result.unresolvedChangedSourceFiles).toEqual([unresolvedSourcePath]);
      expect(invokedArgs(runner)).toContain(testFile);
    });
  });

  it("passes staged changed selection through the CLI", async () => {
    const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const baseRef = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedPassingRun(productDir, {
      exitCode: SUCCESS_EXIT_CODE,
      groups: [],
      unmatched: [],
      unresolvedTargets: [],
      reports: [],
      outcomes: [],
    });

    const result = await runTestingCli([
      TESTING_CLI.commandName,
      TESTING_CLI.changedLongFlag,
      TESTING_CLI.stagedLongFlag,
      TESTING_CLI.baseLongFlag,
      baseRef,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(agentCalls).toEqual([]);
    expect(streamCalls).toEqual([{ productDir, passing: false, changed: { baseRef, staged: true } }]);
    expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
  });

  it("reads staged config snapshots when staged changed selection runs", async () => {
    const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
    const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());
    const malformedTestingConfig = [TESTING_SECTION, "["].join(": ");
    const stagedTestingConfig = `${TESTING_SECTION}: {}\n`;
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const testPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));

    await withTestingTempProductDir(async (productDir) => {
      await writeFile(join(productDir, CONFIG_FILENAMES.yaml), malformedTestingConfig);
      await writeTestFileFixture(productDir, testPath);

      const run = await runTestsCommand(
        {
          productDir,
          passing: false,
          changed: { baseRef: GIT_TEST_REF.HEAD_NAME, staged: true },
        },
        {
          registry: testingRegistry,
          runnerDepsFor: () => runner,
          relatedDepsFor: () => ({
            isLanguagePresent: () => true,
            readFile: async () => "",
            runCommand: async () => ({ exitCode: SUCCESS_EXIT_CODE, stdout: "", stderr: "" }),
          }),
          git: stagedConfigChangeGit(headSha, stagedTestingConfig, testPath),
        },
      );

      expect(run.dispatch.exitCode).toBe(SUCCESS_EXIT_CODE);
      expect(invokedArgs(runner)).toContain(testPath);
    });
  });

  it("requires related-test dependencies for changed-set command runs", async () => {
    const runner = createRecordingCommandRunner({ present: true, exitCode: SUCCESS_EXIT_CODE });
    const headSha = sampleLiteralTestValue(arbitraryDomainLiteral());

    await withTestingTempProductDir(async (productDir) => {
      await expect(
        runTestsCommand(
          {
            productDir,
            passing: false,
            changed: { baseRef: GIT_TEST_REF.HEAD_NAME, staged: true },
          },
          {
            registry: testingRegistry,
            runnerDepsFor: () => runner,
            git: stagedConfigChangeGit(headSha, `${TESTING_SECTION}: {}\n`),
          },
        ),
      ).rejects.toThrow(CHANGED_TEST_RELATED_DEPS_ERROR);
    });
  });

  it("prints unresolved changed source warnings without failing a passing CLI run", async () => {
    const productDir = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run = recordedPassingRun(productDir, {
      exitCode: SUCCESS_EXIT_CODE,
      groups: [],
      unmatched: [],
      unresolvedTargets: [],
      unresolvedChangedSourceFiles: [unresolvedSourcePath],
      reports: [],
      outcomes: [],
    });

    const result = await runTestingCli([
      TESTING_CLI.commandName,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(result.stderr).toContain(unresolvedSourcePath);
    expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
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
