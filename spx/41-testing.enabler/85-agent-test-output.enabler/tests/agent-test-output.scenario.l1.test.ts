import { Command } from "commander";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RecordedTestRun } from "@/commands/testing";
import {
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/testing";
import {
  createTestingDomain,
  TESTING_CLI,
  type TestingCliDependencies,
} from "@/interfaces/cli/testing";
import {
  AGENT_TEST_OUTPUT_TEXT,
  formatAgentTestOutput,
} from "@/interfaces/cli/testing-agent-output";
import { pythonTestingLanguage } from "@/testing/languages/python";
import { typescriptTestingLanguage } from "@/testing/languages/typescript";
import {
  TEST_RUN_STATE_FIELDS,
  TEST_RUN_STATE_STATUS,
  type TestRunFile,
  type TestRunState,
  type TestRunStateStatus,
} from "@/testing/run-state";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryDomainLiteral,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import {
  sampleDispatchValue,
  TEST_DISPATCH_GENERATOR,
  testingCliCommanderParseSource,
} from "@testing/generators/testing/dispatch";

interface TestingCliCall {
  readonly productDir: string;
  readonly passing: boolean;
}

interface TestingCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCodes: readonly number[];
}

interface PassingAgentRunFixture {
  readonly run: RecordedTestRun;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

function sampleText(): string {
  return sampleLiteralTestValue(arbitraryDomainLiteral());
}

function testRunFile(runFilePath: string): TestRunFile {
  return {
    runsDir: sampleText(),
    runFilePath,
    runFileName: sampleText(),
    runToken: sampleText(),
    runId: sampleText(),
    startedAt: sampleText(),
  };
}

function testRunState(runStatus: TestRunStateStatus): TestRunState {
  return {
    branchName: sampleText(),
    headSha: sampleText(),
    testingConfigDigest: sampleText(),
    runnerOutcomes: [],
    discoveredTestPathsDigest: sampleText(),
    discoveredTestContentDigest: sampleText(),
    productInputDigests: [],
    startedAt: sampleText(),
    completedAt: sampleText(),
    [TEST_RUN_STATE_FIELDS.STATUS]: runStatus,
  };
}

function testingCliDeps(
  productDir: string,
  run: RecordedTestRun,
  agentCalls: TestingCliCall[],
  streamCalls: TestingCliCall[],
): TestingCliDependencies {
  return {
    resolveProductDir: () => Promise.resolve(productDir),
    runTests: (resolvedProductDir, passing) => {
      streamCalls.push({ productDir: resolvedProductDir, passing });
      return Promise.resolve(run);
    },
    runAgentTests: (resolvedProductDir, passing) => {
      agentCalls.push({ productDir: resolvedProductDir, passing });
      return Promise.resolve(run);
    },
    writeStdout: () => undefined,
    setExitCode: () => undefined,
    exit: () => {
      throw new Error("Unexpected streaming exit in agent-mode test");
    },
  };
}

async function runTestingCli(args: readonly string[], deps: TestingCliDependencies): Promise<TestingCliResult> {
  const program = new Command();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  program.exitOverride();
  program.configureOutput({
    writeOut: (output) => stdout.push(output),
    writeErr: (output) => stderr.push(output),
  });
  createTestingDomain({
    ...deps,
    writeStdout: (output) => stdout.push(output),
    setExitCode: (exitCode) => exitCodes.push(exitCode),
  }).register(program);

  await program.parseAsync([...args], { from: testingCliCommanderParseSource() });

  return { stdout: stdout.join(""), stderr: stderr.join(""), exitCodes };
}

function passingAgentRun(productDir: string, testPaths: readonly string[] = []): PassingAgentRunFixture {
  const stdoutPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDOUT);
  const stderrPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDERR);
  return {
    stdoutPath,
    stderrPath,
    run: {
      dispatch: {
        exitCode: SUCCESS_EXIT_CODE,
        groups: [],
        unmatched: [],
        reports: [{
          runnerId: typescriptTestingLanguage.name,
          testPaths,
          exitCode: SUCCESS_EXIT_CODE,
          output: { stdoutPath, stderrPath },
        }],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.PASSED),
    },
  };
}

function failingPythonRun(
  productDir: string,
  failingPath: string,
  failingExitCode: number,
  failingTestPaths?: readonly string[],
): RecordedTestRun {
  const failureOutput = {
    stdoutPath: join(productDir, AGENT_TEST_OUTPUT_TEXT.STDOUT),
    stderrPath: join(productDir, AGENT_TEST_OUTPUT_TEXT.STDERR),
    ...(failingTestPaths === undefined ? {} : { failingTestPaths }),
  };
  return {
    dispatch: {
      exitCode: failingExitCode,
      groups: [],
      unmatched: [],
      reports: [{
        runnerId: pythonTestingLanguage.name,
        testPaths: [failingPath],
        exitCode: failingExitCode,
        output: failureOutput,
      }],
      outcomes: [],
    },
    runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
    recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
  };
}

describe("agent test-output summary", () => {
  it("reports failed runner identity, failed paths, state, exit code, and artifacts", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const passingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const stdoutPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDOUT);
    const stderrPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDERR);
    const runFilePath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE);
    const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: failingExitCode,
        groups: [],
        unmatched: [],
        reports: [{
          runnerId: typescriptTestingLanguage.name,
          testPaths: [failingPath, passingPath],
          exitCode: failingExitCode,
          output: { stdoutPath, stderrPath, failingTestPaths: [failingPath] },
        }],
        outcomes: [],
      },
      runFile: testRunFile(runFilePath),
      recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
    };

    const output = formatAgentTestOutput(run);

    expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.HEADER);
    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.STATUS}: ${TEST_RUN_STATE_STATUS.FAILED}`);
    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${failingExitCode}`);
    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${typescriptTestingLanguage.name}`);
    expect(output).toContain(runFilePath);
    expect(output).toContain(stdoutPath);
    expect(output).toContain(stderrPath);
    expect(output).toContain(failingPath);
    expect(output).not.toContain(passingPath);
  });

  it("reports requested paths for failing runners without narrowed failure metadata", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
    const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());

    const output = formatAgentTestOutput(failingPythonRun(productDir, failingPath, failingExitCode));

    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${pythonTestingLanguage.name}`);
    expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS);
    expect(output).toContain(failingPath);
  });

  it("reports requested paths when narrowed failure metadata is empty", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
    const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());

    const output = formatAgentTestOutput(failingPythonRun(productDir, failingPath, failingExitCode, []));

    expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS);
    expect(output).toContain(failingPath);
  });

  it("routes passing agent mode through captured output without forcing process exit", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const { run, stdoutPath, stderrPath } = passingAgentRun(productDir);

    const result = await runTestingCli([
      TESTING_CLI.commandName,
      TESTING_CLI.passingSubcommand,
      TESTING_CLI.agentOption,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(agentCalls).toEqual([{ productDir, passing: true }]);
    expect(streamCalls).toEqual([]);
    expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
    expect(result.stdout).toContain(AGENT_TEST_OUTPUT_TEXT.HEADER);
    expect(result.stdout).toContain(stdoutPath);
    expect(result.stdout).toContain(stderrPath);
  });

  it("routes parent agent mode through captured output for passing scope", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const { run, stdoutPath, stderrPath } = passingAgentRun(productDir);

    const result = await runTestingCli([
      TESTING_CLI.commandName,
      TESTING_CLI.agentOption,
      TESTING_CLI.passingSubcommand,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(agentCalls).toEqual([{ productDir, passing: true }]);
    expect(streamCalls).toEqual([]);
    expect(result.exitCodes).toEqual([SUCCESS_EXIT_CODE]);
    expect(result.stdout).toContain(AGENT_TEST_OUTPUT_TEXT.HEADER);
    expect(result.stdout).toContain(stdoutPath);
    expect(result.stdout).toContain(stderrPath);
  });

  it("reports passing runner counts and artifacts without listing passing test paths", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const passingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const stdoutPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDOUT);
    const stderrPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDERR);
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: SUCCESS_EXIT_CODE,
        groups: [],
        unmatched: [],
        reports: [{
          runnerId: typescriptTestingLanguage.name,
          testPaths: [passingPath],
          exitCode: SUCCESS_EXIT_CODE,
          output: { stdoutPath, stderrPath },
        }],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.PASSED),
    };

    const output = formatAgentTestOutput(run);

    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.TESTS}: 1`);
    expect(output).toContain(stdoutPath);
    expect(output).toContain(stderrPath);
    expect(output).not.toContain(passingPath);
  });

  it("reports failed status and requested paths when selected runner groups produce no reports", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const selectedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: NO_RUNNER_INVOCATION_EXIT_CODE,
        groups: [{
          language: typescriptTestingLanguage,
          testPaths: [selectedPath],
        }],
        unmatched: [],
        reports: [],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.PASSED),
    };

    const output = formatAgentTestOutput(run);

    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.STATUS}: ${TEST_RUN_STATE_STATUS.FAILED}`);
    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${NO_RUNNER_INVOCATION_EXIT_CODE}`);
    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${typescriptTestingLanguage.name}`);
    expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS);
    expect(output).toContain(selectedPath);
  });

  it("reports unreported selected groups when another runner fails", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const unreportedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
    const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: failingExitCode,
        groups: [{
          language: typescriptTestingLanguage,
          testPaths: [failingPath],
        }, {
          language: pythonTestingLanguage,
          testPaths: [unreportedPath],
        }],
        unmatched: [],
        reports: [{
          runnerId: typescriptTestingLanguage.name,
          testPaths: [failingPath],
          exitCode: failingExitCode,
        }],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
    };

    const output = formatAgentTestOutput(run);

    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${typescriptTestingLanguage.name}`);
    expect(output).toContain(failingPath);
    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${pythonTestingLanguage.name}`);
    expect(output).toContain(unreportedPath);
  });

  it("hides unreported selected groups when reported runners pass", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const reportedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const unreportedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: SUCCESS_EXIT_CODE,
        groups: [{
          language: typescriptTestingLanguage,
          testPaths: [reportedPath],
        }, {
          language: pythonTestingLanguage,
          testPaths: [unreportedPath],
        }],
        unmatched: [],
        reports: [{
          runnerId: typescriptTestingLanguage.name,
          testPaths: [reportedPath],
          exitCode: SUCCESS_EXIT_CODE,
        }],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.PASSED),
    };

    const output = formatAgentTestOutput(run);

    expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${typescriptTestingLanguage.name}`);
    expect(output).not.toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${pythonTestingLanguage.name}`);
    expect(output).not.toContain(unreportedPath);
  });

  it("sets failed exit code when agent mode selects runner groups with no reports", async () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const selectedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
    const agentCalls: TestingCliCall[] = [];
    const streamCalls: TestingCliCall[] = [];
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: NO_RUNNER_INVOCATION_EXIT_CODE,
        groups: [{
          language: typescriptTestingLanguage,
          testPaths: [selectedPath],
        }],
        unmatched: [],
        reports: [],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.PASSED),
    };

    const result = await runTestingCli([
      TESTING_CLI.commandName,
      TESTING_CLI.agentOption,
      TESTING_CLI.passingSubcommand,
    ], testingCliDeps(productDir, run, agentCalls, streamCalls));

    expect(agentCalls).toEqual([{ productDir, passing: true }]);
    expect(streamCalls).toEqual([]);
    expect(result.exitCodes).toEqual([NO_RUNNER_INVOCATION_EXIT_CODE]);
    expect(result.stdout).toContain(selectedPath);
  });

  it("reports unmatched test paths under the unmatched label", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const unmatchedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.unmatchedTestFileUnder(nodePath));
    const run: RecordedTestRun = {
      dispatch: {
        exitCode: UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
        groups: [],
        unmatched: [unmatchedPath],
        reports: [],
        outcomes: [],
      },
      runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
      recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
    };

    const output = formatAgentTestOutput(run);

    expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.UNMATCHED);
    expect(output).toContain(unmatchedPath);
  });
});
