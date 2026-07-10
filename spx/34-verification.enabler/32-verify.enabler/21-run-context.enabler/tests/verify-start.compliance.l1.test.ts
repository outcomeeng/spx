import { describe, it } from "vitest";

import {
  assertStartPreservesReusedVerificationContextWhenInputPersistenceFails,
  assertStartPreservesReusedVerificationContextWhenJournalOpenFails,
  assertStartRecordsInputForInputReplay,
  assertStartRejectsChangedScopeFailureBeforeOpeningRun,
  assertStartRejectsUnsupportedVerificationTypeBeforeOpeningRun,
  assertStartRemovesOpenedRunArtifactsWhenInputPersistenceFails,
  assertStartRemovesVerificationContextWhenJournalOpenFails,
  assertStartReportsInputReadFailuresBeforeOpeningRun,
  assertStartReportsPersistableRunLocator,
  assertStartRequiresNonBlankInputSource,
  assertWorkingTreeScopeIsRejected,
} from "@testing/harnesses/verify/harness";

describe("verify start compliance", () => {
  it("requires a non-blank --input source before starting a run", async () => {
    await assertStartRequiresNonBlankInputSource();
  });

  it("rejects an unsupported verification type before opening a run", async () => {
    await assertStartRejectsUnsupportedVerificationTypeBeforeOpeningRun();
  });

  it("rejects a changed-scope failure before opening an addressable run", async () => {
    await assertStartRejectsChangedScopeFailureBeforeOpeningRun();
  });

  it("reports input-read failures before opening an addressable run", async () => {
    await assertStartReportsInputReadFailuresBeforeOpeningRun();
  });

  it("removes the verification context when journal opening fails", async () => {
    await assertStartRemovesVerificationContextWhenJournalOpenFails();
  });

  it("preserves a reused verification context when journal opening fails", async () => {
    await assertStartPreservesReusedVerificationContextWhenJournalOpenFails();
  });

  it("removes opened run artifacts when recorded-input persistence fails", async () => {
    await assertStartRemovesOpenedRunArtifactsWhenInputPersistenceFails();
  });

  it("preserves a reused verification context when recorded-input persistence fails", async () => {
    await assertStartPreservesReusedVerificationContextWhenInputPersistenceFails();
  });

  it("records the verification input at start so the input verb replays it", async () => {
    await assertStartRecordsInputForInputReplay();
  });

  it("reports every run-locator selector a caller persists to replay the run identity", async () => {
    await assertStartReportsPersistableRunLocator();
  });

  it("rejects a working-tree scope type that the verification-context substrate cannot represent", async () => {
    await assertWorkingTreeScopeIsRejected();
  });
});
