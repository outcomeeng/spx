import { describe, expect, it } from "vitest";

import { JOURNAL_BACKEND } from "@/domains/journal/backend-selection";
import { VERIFY_SCOPE_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { arbitraryFileScopeIdentityScenario } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

import {
  assertStartPreservesReusedVerificationContextWhenInputPersistenceFails,
  assertStartPreservesReusedVerificationContextWhenJournalOpenFails,
  assertStartPreservesReusedVerificationContextWhenRunContextFails,
  assertStartRecordsInputForInputReplay,
  assertStartRejectsChangedScopeFailureBeforeOpeningRun,
  assertStartRejectsUnsupportedVerificationTypeBeforeOpeningRun,
  assertStartRemovesOpenedRunArtifactsWhenInputPersistenceFails,
  assertStartRemovesOpenedRunArtifactsWhenRunContextFails,
  assertStartRemovesVerificationContextWhenJournalOpenFails,
  assertStartReportsInputReadFailuresBeforeOpeningRun,
  assertStartReportsPersistableRunLocator,
  assertStartRequiresNonBlankInputSource,
  assertWorkingTreeScopeIsRejected,
  startFileScopeRun,
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

  it("removes opened run artifacts when recording the run drive mode fails", async () => {
    await assertStartRemovesOpenedRunArtifactsWhenRunContextFails();
  });

  it("preserves a reused verification context when recording the run drive mode fails", async () => {
    await assertStartPreservesReusedVerificationContextWhenRunContextFails();
  });

  it("records the verification input at start so the input verb replays it", async () => {
    await assertStartRecordsInputForInputReplay();
  });

  it("reports every run-locator selector a caller persists to replay the run identity", async () => {
    await assertStartReportsPersistableRunLocator();
  });

  it("reports every file selector needed to replay the run identity", async () => {
    await assertProperty(
      arbitraryFileScopeIdentityScenario(),
      async (scope) => {
        const started = await startFileScopeRun(scope.input);
        expect(started.report.locator).toMatchObject({
          runToken: started.report.runToken,
          verificationType: VERIFY_VERIFICATION_TYPE.AUDIT,
          scopeType: VERIFY_SCOPE_TYPE.FILE,
          scopeIdentity: scope.normalized,
          backendIdentity: JOURNAL_BACKEND.LOCAL,
        });
        expect(started.report.locator.storageNamespace.length).toBeGreaterThan(0);
        expect(started.report.locator.runTarget).toContain(started.report.runToken);
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects a working-tree scope type that the verification-context substrate cannot represent", async () => {
    await assertWorkingTreeScopeIsRejected();
  });
});
