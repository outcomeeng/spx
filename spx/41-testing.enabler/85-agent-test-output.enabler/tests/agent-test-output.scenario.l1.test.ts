import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RecordedTestRun } from "@/commands/testing";
import { SUCCESS_EXIT_CODE } from "@/domains/testing";
import { AGENT_TEST_OUTPUT_TEXT, formatAgentTestOutput } from "@/interfaces/cli/testing-agent-output";
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
import { sampleDispatchValue, TEST_DISPATCH_GENERATOR } from "@testing/generators/testing/dispatch";

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

describe("agent test-output summary", () => {
  it("reports failed runner identity, failed paths, state, exit code, and artifacts", () => {
    const productDir = sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir());
    const nodePath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.nodePath());
    const failingPath = sampleDispatchValue(TEST_DISPATCH_GENERATOR.testFileUnder(typescriptTestingLanguage, nodePath));
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
          testPaths: [failingPath],
          exitCode: failingExitCode,
          output: { stdoutPath, stderrPath },
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
});
