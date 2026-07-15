import { describe, it } from "vitest";

import {
  assertExecutorGatesUnsupportedTypeWithoutRecording,
  assertExecutorOpensSpxDrivenRunWithoutEvidenceAppendActions,
  assertExecutorReachesRunnerThroughRegistry,
  assertExecutorRecordsOnlyThroughRecorderOperations,
  assertExecutorRecordsSeparatorStraddlingFindingsDistinctly,
  assertExecutorSealsRunWhenRunnerFails,
  assertRecorderRaisesWhenLifecycleCommandFails,
  assertTestRunnerFoldsFailedTerminalStatus,
  assertTestRunnerFoldsInterruptedTerminalStatus,
  assertTestRunnerGatesOutWhenNoLanguageStreams,
} from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor compliance", () => {
  it("records scope, finding, and terminal evidence only through the verify recorder lifecycle", async () => {
    await assertExecutorRecordsOnlyThroughRecorderOperations();
  });

  it("opens the run in spx drive mode so an unsealed run advertises no caller evidence-append action", async () => {
    await assertExecutorOpensSpxDrivenRunWithoutEvidenceAppendActions();
  });

  it("reaches the test type's runner through the testing registry, naming no language", async () => {
    await assertExecutorReachesRunnerThroughRegistry();
  });

  it("opens no run when the verification type resolves to no runner", async () => {
    await assertExecutorGatesUnsupportedTypeWithoutRecording();
  });

  it("raises rather than swallows a non-OK recorder command for open, scope, finding, and finish", async () => {
    await assertRecorderRaisesWhenLifecycleCommandFails();
  });

  it("folds a failing language to a failed run terminal status over passing and interrupted languages", async () => {
    await assertTestRunnerFoldsFailedTerminalStatus();
  });

  it("folds an interrupted language to an interrupted run terminal status when no language failed", async () => {
    await assertTestRunnerFoldsInterruptedTerminalStatus();
  });

  it("gates the run out when every registry language is non-streaming or gated out", async () => {
    await assertTestRunnerGatesOutWhenNoLanguageStreams();
  });

  it("records two separator-straddling findings distinctly rather than collapsing them onto one key", async () => {
    await assertExecutorRecordsSeparatorStraddlingFindingsDistinctly();
  });

  it("finishes the opened run interrupted when the runner fails, before surfacing the failure", async () => {
    await assertExecutorSealsRunWhenRunnerFails();
  });
});
