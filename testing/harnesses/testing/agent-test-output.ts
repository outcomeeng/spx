import { readdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";

import { expect } from "vitest";

import { type RecordedTestRun, TEST_RESULT_KIND } from "@/commands/test";
import {
  NO_RUNNER_INVOCATION_EXIT_CODE,
  SUCCESS_EXIT_CODE,
  UNSUPPORTED_TEST_SELECTION_EXIT_CODE,
} from "@/domains/test";
import { TESTING_CLI } from "@/interfaces/cli/test";
import { AGENT_TEST_OUTPUT_TEXT, formatAgentTestOutput } from "@/interfaces/cli/test-agent-output";
import type { AgentRunnerOptions } from "@/interfaces/cli/test-runner-deps";
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
  sampleIndependentDomainLiterals,
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

export interface RecordedProcessSpawn {
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
      kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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

export interface NoReportedFailedPathsObservation {
  readonly output: string;
  readonly runnerName: string;
  readonly exitCode: number;
  readonly requestedPathCount: number;
  readonly requestedPath: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

function observeFailingRunnerWithoutReportedPaths(
  failingTestPaths?: readonly string[],
): NoReportedFailedPathsObservation {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const requestedPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(pythonTestingLanguage, nodePath));
  const exitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
  const run = failingPythonRun(productDir, requestedPath, exitCode, failingTestPaths);
  const [report] = run.dispatch.reports;
  return {
    output: formatAgentTestOutput(run),
    runnerName: report.runnerId,
    exitCode: report.exitCode,
    requestedPathCount: report.testPaths.length,
    requestedPath,
    stdoutPath: join(productDir, AGENT_TEST_OUTPUT_TEXT.STDOUT),
    stderrPath: join(productDir, AGENT_TEST_OUTPUT_TEXT.STDERR),
  };
}

export interface FailedRunnerDetailsObservation {
  readonly output: string;
  readonly runnerName: string;
  readonly exitCode: number;
  readonly failingPath: string;
  readonly unreportedPath: string;
  readonly runFilePath: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}

export function observeFailingRunnerWithReportedFailingPath(): FailedRunnerDetailsObservation {
  const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
  const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
  const [failingPath, unreportedPath] = sampleDispatchValue(
    TEST_DISPATCH_GENERATOR.distinctTestFilesUnder(typescriptTestingLanguage, nodePath),
  );
  const stdoutPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDOUT);
  const stderrPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STDERR);
  const runFilePath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE);
  const failingExitCode = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nonZeroExitCode());
  const run: RecordedTestRun = {
    kind: TEST_RESULT_KIND.EXECUTED,
    dispatch: {
      exitCode: failingExitCode,
      groups: [],
      unmatched: [],
      unresolvedTargets: [],
      reports: [{
        runnerId: typescriptTestingLanguage.name,
        testPaths: [failingPath, unreportedPath],
        exitCode: failingExitCode,
        output: { stdoutPath, stderrPath, failingTestPaths: [failingPath] },
      }],
      outcomes: [],
    },
    runFile: testRunFile(runFilePath),
    recorded: testRunState(TEST_RUN_STATE_STATUS.FAILED),
  };
  return {
    output: formatAgentTestOutput(run),
    runnerName: typescriptTestingLanguage.name,
    exitCode: failingExitCode,
    failingPath,
    unreportedPath,
    runFilePath,
    stdoutPath,
    stderrPath,
  };
}

export function observeFailingRunnerWithoutFailureMetadata(): NoReportedFailedPathsObservation {
  return observeFailingRunnerWithoutReportedPaths();
}

export function observeFailingRunnerWithEmptyFailureMetadata(): NoReportedFailedPathsObservation {
  return observeFailingRunnerWithoutReportedPaths([]);
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
  expect(output).not.toContain(failingPath);
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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
    kind: TEST_RESULT_KIND.EXECUTED,
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

/** Cross-assertion resource setup for the agent-output compliance evidence. */
const AGENT_OUTPUT_PRODUCT_DIR_PREFIX = "spx-agent-output-product-";
const USER_TEMP_SENTINEL_PREFIX = "spx-agent-output-user-temp-";
const USER_TEMP_ENV_NAMES = ["TMPDIR", "TEMP", "TMP"] as const;
const AGENT_RUNNER_MODULE_PATH = "src/interfaces/cli/test-runner-deps.ts";

export interface ChildOutputCase {
  readonly stdoutContent: string;
  readonly stderrContent: string;
  readonly envKey: string;
  readonly envValue: string;
}

export interface NodeCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export interface OffTerminalObservation {
  readonly exitCode: number;
  readonly terminalStdout: string;
  readonly terminalStderr: string;
  readonly stdoutContent: string;
  readonly stderrContent: string;
  readonly serializedResult: string;
}

/** Runs the callback with a fresh product directory that stands in for one worktree root. */
export function withAgentOutputProduct<T>(callback: (productDir: string) => Promise<T>): Promise<T> {
  return withTempDir(AGENT_OUTPUT_PRODUCT_DIR_PREFIX, callback);
}

/** Four mutually independent child-output values: the contents the child writes and the env pair it reads. */
export function sampleChildOutputCase(): ChildOutputCase {
  const [stdoutContent, stderrContent, envKey, envValue] = sampleIndependentDomainLiterals(4);
  return { stdoutContent, stderrContent, envKey, envValue };
}

/** Two independent opaque runner operands for a runner command that is recorded or never executed. */
export function sampleRunnerOperands(): { readonly command: string; readonly arg: string } {
  const [command, arg] = sampleIndependentDomainLiterals(2);
  return { command, arg };
}

/** The command line of a child that writes the case's stdout and stderr and echoes its cwd and env value. */
export function nodeOutputCommand(output: ChildOutputCase): NodeCommand {
  return {
    command: process.execPath,
    args: [NODE_EVAL_ARG, outputScript(output.stdoutContent, output.stderrContent, output.envKey)],
  };
}

/** Records every spawn's command, arguments, and environment, then starts an inert node child. */
export function recordingSpawnRunner(calls: RecordedProcessSpawn[]): ProcessRunner {
  return recordingProcessRunner(calls);
}

/**
 * Records the entries of the artifacts directory at the moment each runner command is spawned, then
 * starts an inert node child. A missing directory records as an empty listing.
 */
export function artifactListingSpawnRunner(artifactsDir: string, listings: string[][]): ProcessRunner {
  return {
    spawn(_command, _args, options) {
      listings.push(listDirectoryOrEmpty(artifactsDir));
      return spawnManagedSubprocess(lifecycleProcessRunner, process.execPath, [NODE_EVAL_ARG, ""], {
        cwd: options?.cwd,
        env: options?.env,
      });
    },
  };
}

/** Runner options whose artifact write stream fails and whose child never exits on its own. */
export function artifactWriteFailureOptions(failureMessage: string): AgentRunnerOptions {
  return {
    env: {},
    processRunner: persistentProcessRunner(),
    createArtifactWriteStream: () => failingArtifactWriteStream(failureMessage),
  };
}

/**
 * Points the user temp folder at a fresh empty directory while the callback runs, then returns every
 * entry found in that directory. A write under `os.tmpdir()` during the callback lands in it.
 */
export async function observeUserTempFolderDuring(run: () => Promise<void>): Promise<readonly string[]> {
  return withTempDir(USER_TEMP_SENTINEL_PREFIX, async (sentinelDir) => {
    const previous = USER_TEMP_ENV_NAMES.map((name) => [name, process.env[name]] as const);
    for (const name of USER_TEMP_ENV_NAMES) process.env[name] = sentinelDir;
    try {
      await run();
    } finally {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    return readdir(sentinelDir, { recursive: true });
  });
}

/**
 * Runs the agent-output runner in a separate node process so the invoking terminal streams are real
 * process streams, and returns what reached them together with the captured result.
 */
export async function observeChildStreamsOffTerminal(): Promise<OffTerminalObservation> {
  const output = sampleChildOutputCase();
  return withAgentOutputProduct(async (productDir) => {
    const resultPath = join(productDir, AGENT_TEST_OUTPUT_TEXT.STATE_FILE);
    const repoDir = process.cwd();
    const moduleUrl = pathToFileURL(join(repoDir, AGENT_RUNNER_MODULE_PATH)).href;
    const { command, args } = nodeOutputCommand(output);
    const script = [
      `const productDir = ${JSON.stringify(productDir)};`,
      `const resultPath = ${JSON.stringify(resultPath)};`,
      `const { createAgentOutputCommandRunner } = await import(${JSON.stringify(moduleUrl)});`,
      `const { writeFile } = await import(${JSON.stringify("node:fs/promises")});`,
      `const runCommand = createAgentOutputCommandRunner(productDir, { env: {} });`,
      `const result = await runCommand(${JSON.stringify(command)}, ${JSON.stringify(args)});`,
      "await writeFile(resultPath, Buffer.from(JSON.stringify(result)));",
    ].join("");

    const result = await runNodeProcess(["--import", "tsx", NODE_EVAL_ARG, script], repoDir);

    return {
      exitCode: result.exitCode,
      terminalStdout: result.stdout,
      terminalStderr: result.stderr,
      stdoutContent: output.stdoutContent,
      stderrContent: output.stderrContent,
      serializedResult: String(await readFile(resultPath)),
    };
  });
}

function listDirectoryOrEmpty(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
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
