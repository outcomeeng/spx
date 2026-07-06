import {
  expectAgentModeNoRunnerReportsExitCode,
  expectAgentSummaryReportsFailedRunnerDetails,
  expectAgentSummaryReportsNoRunnerReportsAsFailure,
  expectAgentSummaryReportsPassingCountsAndArtifacts,
  expectAgentSummaryReportsRequestedPathsWithEmptyFailureMetadata,
  expectAgentSummaryReportsRequestedPathsWithoutFailureMetadata,
  expectAgentSummaryReportsUnmatchedPaths,
  expectAgentSummaryReportsUnreportedGroupWhenAnotherRunnerFails,
  expectAgentSummaryReportsUnreportedGroupWhenReportedRunnersPass,
  expectAgentSummaryReportsUnresolvedChangedSources,
  expectAgentSummaryReportsUnresolvedTargets,
  expectParentAgentModeUsesCapturedOutput,
  expectPassingAgentModeUsesCapturedOutput,
} from "@testing/harnesses/testing/agent-test-output";
import { describe, it } from "vitest";

describe("agent test-output summary", () => {
  it("reports failed runner identity, failed paths, state, exit code, and artifacts", () => {
    expectAgentSummaryReportsFailedRunnerDetails();
  });

  it("reports requested paths for failing runners without narrowed failure metadata", () => {
    expectAgentSummaryReportsRequestedPathsWithoutFailureMetadata();
  });

  it("reports requested paths when narrowed failure metadata is empty", () => {
    expectAgentSummaryReportsRequestedPathsWithEmptyFailureMetadata();
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
