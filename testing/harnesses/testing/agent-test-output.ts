import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

import { expect } from "vitest";

import type { RecordedTestRun } from "@/commands/test";
import {
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT, formatAgentTestOutput } from "@/interfaces/cli/test-agent-output";
import {
  AGENT_ARTIFACT_DIR_PREFIX,
  createAgentOutputCommandRunner,
  PROCESS_FAILURE_EXIT_CODE,
} from "@/interfaces/cli/test-runner-deps";
import { lifecycleProcessRunner, type ProcessRunner, spawnManagedSubprocess } from "@/lib/process-lifecycle";
import { pythonTestingLanguage } from "@/test/languages/python";
import { typescriptTestingLanguage } from "@/test/languages/typescript";
import {
  TEST_RUN_STATE_FIELDS,
  TEST_RUN_STATE_STATUS,
  type TestRunFile,
  type TestRunState,
  type TestRunStateStatus,
} from "@/test/run-state";
import { VALIDATION_SUBPROCESS_EVENTS } from "@/validation/steps/subprocess-output";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryDomainLiteral,
  arbitrarySourceFilePath,
  sampleLiteralTestValue,
} from "@testing/generators/literal/literal";
import { nodeOperand, sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";
import { runTestingCli, type TestingCliCall, testingCliDeps } from "@testing/harnesses/testing/cli";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

interface PassingAgentRunFixture {
  readonly run: RecordedTestRun;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

interface RecordedProcessSpawn {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

const NODE_EVAL_ARG = "-e";

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
        unresolvedTargets: [],
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
      unresolvedTargets: [],
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

export function expectAgentSummaryReportsFailedRunnerDetails(): void {
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
      unresolvedTargets: [],
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
}

export function expectAgentSummaryReportsRequestedPathsWithoutFailureMetadata(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
  const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());

  const output = formatAgentTestOutput(failingPythonRun(productDir, failingPath, failingExitCode));

  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${pythonTestingLanguage.name}`);
  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS);
  expect(output).toContain(failingPath);
}

export function expectAgentSummaryReportsRequestedPathsWithEmptyFailureMetadata(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
  const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());

  const output = formatAgentTestOutput(failingPythonRun(productDir, failingPath, failingExitCode, []));

  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS);
  expect(output).toContain(failingPath);
}

export async function expectPassingAgentModeUsesCapturedOutput(): Promise<void> {
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
}

export async function expectParentAgentModeUsesCapturedOutput(): Promise<void> {
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
}

export function expectAgentSummaryReportsPassingCountsAndArtifacts(): void {
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
      unresolvedTargets: [],
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
}

export function expectAgentSummaryReportsNoRunnerReportsAsFailure(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const selectedPath = sampleDispatchValue(
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
  );
  const run: RecordedTestRun = {
    dispatch: {
      exitCode: NO_RUNNER_INVOCATION_EXIT_CODE,
      groups: [{
        language: typescriptTestingLanguage,
        testPaths: [selectedPath],
      }],
      unmatched: [],
      unresolvedTargets: [],
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
  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.SKIPPED_TESTS);
  expect(output).toContain(selectedPath);
}

export function expectAgentSummaryReportsUnreportedGroupWhenAnotherRunnerFails(): void {
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
      unresolvedTargets: [],
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
  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.SKIPPED_TESTS);
  expect(output).toContain(unreportedPath);
}

export function expectAgentSummaryReportsUnreportedGroupWhenReportedRunnersPass(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const reportedPath = sampleDispatchValue(
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
  );
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
      unresolvedTargets: [],
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
  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${pythonTestingLanguage.name}`);
  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.SKIPPED_TESTS);
  expect(output).toContain(unreportedPath);
  expect(output).not.toContain(reportedPath);
}

export async function expectAgentModeNoRunnerReportsExitCode(): Promise<void> {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const selectedPath = sampleDispatchValue(
    TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath),
  );
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
      unresolvedTargets: [],
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
}

export function expectAgentSummaryReportsUnmatchedPaths(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const unmatchedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.unmatchedTestFileUnder(nodePath));
  const run: RecordedTestRun = {
    dispatch: {
      exitCode: UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
      groups: [],
      unmatched: [unmatchedPath],
      unresolvedTargets: [],
      reports: [],
      outcomes: [],
    },
    runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
    recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
  };

  const output = formatAgentTestOutput(run);

  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.UNMATCHED);
  expect(output).toContain(unmatchedPath);
}

export function expectAgentSummaryReportsUnresolvedTargets(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const unresolvedOperand = nodeOperand(nodePath);
  const run: RecordedTestRun = {
    dispatch: {
      exitCode: UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
      groups: [],
      unmatched: [],
      unresolvedTargets: [unresolvedOperand],
      reports: [],
      outcomes: [],
    },
    runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
    recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
  };

  const output = formatAgentTestOutput(run);

  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.UNRESOLVED_TARGETS);
  expect(output).toContain(unresolvedOperand);
}

export function expectAgentSummaryReportsUnresolvedChangedSources(): void {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const unresolvedSourcePath = sampleLiteralTestValue(arbitrarySourceFilePath());
  const run: RecordedTestRun = {
    dispatch: {
      exitCode: UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
      groups: [],
      unmatched: [],
      unresolvedTargets: [],
      unresolvedChangedSourceFiles: [unresolvedSourcePath],
      reports: [],
      outcomes: [],
    },
    runFile: testRunFile(join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE)),
    recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
  };

  const output = formatAgentTestOutput(run);

  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.UNRESOLVED_CHANGED_SOURCE_FILES);
  expect(output).toContain(unresolvedSourcePath);
}

export async function expectAgentOutputDependencySurface(): Promise<void> {
  const runnerDeps = await import("@/interfaces/cli/test-runner-deps");

  expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_COMMAND");
  expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_PROCESS_EVENT");
  expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_STREAM_METHOD");
  expect(runnerDeps).not.toHaveProperty("AGENT_TEST_OUTPUT_TEXT_ENCODING");
}

export async function expectAgentArtifactDirectoryCreationDeferred(): Promise<void> {
  await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
    createAgentOutputCommandRunner(productDir, { tmpDir: productDir });

    expect(await readdir(productDir)).toEqual([]);
  });
}

export async function expectAgentOutputCapturesStreamsAndEnv(): Promise<void> {
  const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
  const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());
  const envKey = sampleLiteralTestValue(arbitraryDomainLiteral());
  const envValue = sampleLiteralTestValue(arbitraryDomainLiteral());

  await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
    const runCommand = createAgentOutputCommandRunner(productDir, {
      tmpDir: productDir,
      env: { [envKey]: envValue },
    });
    const result = await runCommand(process.execPath, [
      NODE_EVAL_ARG,
      outputScript(stdoutContent, stderrContent, envKey),
    ]);

    expect(result.output).toBeDefined();
    if (result.output === undefined) throw new Error("Expected captured runner output");
    expect(String(await readFile(result.output.stdoutPath))).toBe(
      `${stdoutContent}${await realpath(productDir)}`,
    );
    expect(String(await readFile(result.output.stderrPath))).toBe(
      `${stderrContent}${envValue}`,
    );
  });
}

export async function expectAgentOutputPreservesCommandAndArgs(): Promise<void> {
  await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
    const runnerCommand = sampleLiteralTestValue(arbitraryDomainLiteral());
    const runnerArg = sampleLiteralTestValue(arbitraryDomainLiteral());
    const envKey = sampleLiteralTestValue(arbitraryDomainLiteral());
    const envValue = sampleLiteralTestValue(arbitraryDomainLiteral());
    const calls: RecordedProcessSpawn[] = [];
    const runCommand = createAgentOutputCommandRunner(productDir, {
      tmpDir: productDir,
      processRunner: recordingProcessRunner(calls),
      env: { [envKey]: envValue },
    });

    const result = await runCommand(runnerCommand, [
      NODE_EVAL_ARG,
      runnerArg,
    ]);

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([{
      command: runnerCommand,
      args: [
        NODE_EVAL_ARG,
        runnerArg,
      ],
      env: { [envKey]: envValue },
    }]);
  });
}

export async function expectAgentOutputArtifactWriteFailure(): Promise<void> {
  const failureMessage = sampleLiteralTestValue(arbitraryDomainLiteral());

  await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
    const runCommand = createAgentOutputCommandRunner(productDir, {
      tmpDir: productDir,
      env: {},
      processRunner: persistentProcessRunner(),
      createArtifactWriteStream: () => failingArtifactWriteStream(failureMessage),
    });

    const result = await runCommand(
      sampleLiteralTestValue(arbitraryDomainLiteral()),
      [sampleLiteralTestValue(arbitraryDomainLiteral())],
    );

    expect(result).toEqual({ exitCode: PROCESS_FAILURE_EXIT_CODE });
  });
}

export async function expectAgentOutputKeepsChildStreamsOffTerminal(): Promise<void> {
  const stdoutContent = sampleLiteralTestValue(arbitraryDomainLiteral());
  const stderrContent = sampleLiteralTestValue(arbitraryDomainLiteral());
  const envKey = sampleLiteralTestValue(arbitraryDomainLiteral());

  await withTempDir(AGENT_ARTIFACT_DIR_PREFIX, async (productDir) => {
    const resultPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE);
    const repoDir = process.cwd();
    const moduleUrl = pathToFileURL(join(repoDir, "src/interfaces/cli/test-runner-deps.ts")).href;
    const script = [
      `const productDir = ${JSON.stringify(productDir)};`,
      `const resultPath = ${JSON.stringify(resultPath)};`,
      `const { createAgentOutputCommandRunner } = await import(${JSON.stringify(moduleUrl)});`,
      `const { writeFile } = await import(${JSON.stringify("node:fs/promises")});`,
      `const runCommand = createAgentOutputCommandRunner(productDir, { tmpDir: productDir, env: {} });`,
      `const result = await runCommand(process.execPath, [${JSON.stringify(NODE_EVAL_ARG)}, ${
        JSON.stringify(outputScript(stdoutContent, stderrContent, envKey))
      }]);`,
      "await writeFile(resultPath, Buffer.from(JSON.stringify(result)));",
    ].join("");

    const result = await runNodeProcess([
      "--import",
      "tsx",
      NODE_EVAL_ARG,
      script,
    ], repoDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(stdoutContent);
    expect(result.stderr).not.toContain(stderrContent);
    expect(String(await readFile(resultPath))).toContain(AGENT_TEST_OUTPUT_TEXT.STDOUT);
  });
}

function recordingProcessRunner(calls: RecordedProcessSpawn[]): ProcessRunner {
  return {
    spawn(command, args, options) {
      calls.push({ command, args, env: options?.env });
      return spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, [
        NODE_EVAL_ARG,
        "",
      ], { cwd: options?.cwd, env: options?.env });
    },
  };
}

function persistentProcessRunner(): ProcessRunner {
  return {
    spawn(command, args, options) {
      const script = [
        outputScript(command, args.join(""), command),
        "setInterval(() => {}, Number.MAX_SAFE_INTEGER);",
      ].join("");
      return spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, [
        NODE_EVAL_ARG,
        script,
      ], { cwd: options?.cwd, env: options?.env });
    },
  };
}

function runNodeProcess(args: readonly string[], cwd: string): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, args, { cwd });
    let stdout = "";
    let stderr = "";
    if (child.stdout === null || child.stderr === null) {
      reject(new Error("managed subprocess stdio streams are required"));
      return;
    }
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    childStdout.on(VALIDATION_SUBPROCESS_EVENTS.DATA, (chunk: string) => {
      stdout += String(chunk);
    });
    childStderr.on(VALIDATION_SUBPROCESS_EVENTS.DATA, (chunk: string) => {
      stderr += String(chunk);
    });
    child.on(VALIDATION_SUBPROCESS_EVENTS.ERROR, reject);
    child.on(VALIDATION_SUBPROCESS_EVENTS.CLOSE, (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

function outputScript(stdoutContent: string, stderrContent: string, envKey: string): string {
  const cwdRead = ["process", "cwd()"].join(".");
  const envRead = `process.env[${JSON.stringify(envKey)}]`;
  return [
    `process.${AGENT_TEST_OUTPUT_TEXT.STDOUT}.write(${JSON.stringify(stdoutContent)});`,
    `process.${AGENT_TEST_OUTPUT_TEXT.STDERR}.write(${JSON.stringify(stderrContent)});`,
    `process.${AGENT_TEST_OUTPUT_TEXT.STDOUT}.write(${cwdRead});`,
    `process.${AGENT_TEST_OUTPUT_TEXT.STDERR}.write(${envRead} ?? "");`,
  ].join("");
}

function failingArtifactWriteStream(message: string): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error(message));
    },
    final(callback) {
      callback();
    },
  });
}
