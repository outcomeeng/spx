import {
  expectAgentModeNoRunnerReportsExitCode,
  expectAgentSummaryReportsFailedRunnerDetails,
  expectAgentSummaryReportsNoRunnerReportsAsFailure,
  expectAgentSummaryReportsPassingCountsAndArtifacts,
  expectAgentSummaryReportsUnmatchedPaths,
  expectAgentSummaryReportsUnreportedGroupWhenAnotherRunnerFails,
  expectAgentSummaryReportsUnreportedGroupWhenReportedRunnersPass,
  expectAgentSummaryReportsUnresolvedChangedSources,
  expectAgentSummaryReportsUnresolvedTargets,
  expectParentAgentModeUsesCapturedOutput,
  expectPassingAgentModeUsesCapturedOutput,
  type NoReportedFailedPathsObservation,
  observeFailingRunnerWithEmptyFailureMetadata,
  observeFailingRunnerWithoutFailureMetadata,
} from "@testing/harnesses/testing/agent-test-output";
import { describe, expect, it } from "vitest";

import { AGENT_TEST_OUTPUT_TEXT } from "@/interfaces/cli/test-agent-output";

function expectNoReportedFailedPaths(observed: NoReportedFailedPathsObservation): void {
  const { output } = observed;
  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.RUNNER}: ${observed.runnerName}`);
  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.EXIT_CODE}: ${observed.exitCode}`);
  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.TESTS}: ${observed.requestedPathCount}`);
  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.STDOUT}: ${observed.stdoutPath}`);
  expect(output).toContain(`${AGENT_TEST_OUTPUT_TEXT.STDERR}: ${observed.stderrPath}`);
  expect(output).toContain(AGENT_TEST_OUTPUT_TEXT.NO_FAILED_TEST_PATHS);
  expect(output).not.toContain(AGENT_TEST_OUTPUT_TEXT.FAILING_TESTS);
  expect(output).not.toContain(observed.requestedPath);
}

describe("agent test-output summary", () => {
  it("reports failed runner identity, failed paths, state, exit code, and artifacts", () => {
    expectAgentSummaryReportsFailedRunnerDetails();
  });

  it("names the failing runner and lists no paths without failure metadata", () => {
    expectNoReportedFailedPaths(observeFailingRunnerWithoutFailureMetadata());
  });

  it("names the failing runner and lists no paths when failure metadata is empty", () => {
    expectNoReportedFailedPaths(observeFailingRunnerWithEmptyFailureMetadata());
  });

  it("routes passing agent mode through captured output without forcing process exit", async () => {
    await expectPassingAgentModeUsesCapturedOutput();
  });

  it("routes parent agent mode through captured output for passing scope", async () => {
    await expectParentAgentModeUsesCapturedOutput();
  });

  it("reports passing runner counts and artifacts without listing passing test paths", () => {
    expectAgentSummaryReportsPassingCountsAndArtifacts();
  });

  it("reports failed status and requested paths when selected runner groups produce no reports", () => {
    expectAgentSummaryReportsNoRunnerReportsAsFailure();
  });

  it("reports unreported selected groups when another runner fails", () => {
    expectAgentSummaryReportsUnreportedGroupWhenAnotherRunnerFails();
  });

  it("reports unreported selected groups when reported runners pass", () => {
    expectAgentSummaryReportsUnreportedGroupWhenReportedRunnersPass();
  });

  it("sets failed exit code when agent mode selects runner groups with no reports", async () => {
    await expectAgentModeNoRunnerReportsExitCode();
  });

  it("reports unmatched test paths under the unmatched label", () => {
    expectAgentSummaryReportsUnmatchedPaths();
  });

  it("reports unresolved target operands under the unresolved-targets label", () => {
    expectAgentSummaryReportsUnresolvedTargets();
  });

  it("reports unresolved changed source files under the changed-source label", () => {
    expectAgentSummaryReportsUnresolvedChangedSources();
  });
});
