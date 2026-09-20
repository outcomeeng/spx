import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyRenderCommand,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  AUDIT_COVERAGE_REQUIREMENT,
  AUDIT_COVERAGE_STATUS,
  VERIFY_FINDING_DISPOSITION,
  VERIFY_VERIFICATION_TYPE,
  type VerifyFindingCounts,
} from "@/domains/verify/verify";
import { arbitraryFiledOrStaleAuditFinding } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  assertFinishStatusAndRenderShareFindingProjection,
  assertStatusAndRenderHydrateWithMalformedRecordedInput,
  assertStatusAndRenderHydrateWithoutRecordedInput,
  assertStatusAndRenderRejectMismatchedTerminalRecordedInput,
  assertStatusAndRenderRejectRawUnterminalRun,
  assertStatusAndRenderRejectRequestedScopeMismatch,
  assertStatusAndRenderRejectUnsupportedVerificationType,
  assertStatusFinishedRunProjection,
  assertStatusStartedRunProjection,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  parseRenderReport,
  parseStatusReport,
  startedRunToken,
  verifyAppendOptions,
  verifyRenderOptions,
  verifyStatusOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify status compliance", () => {
  it("reports run token, verification type, scope type, unsealed state, last sequence, and next legal actions for a started run", async () => {
    await assertStatusStartedRunProjection();
  });

  it("reports sealed state, terminal status, and no remaining lifecycle actions after finish", async () => {
    await assertStatusFinishedRunProjection();
  });

  it("reports the same authoritative finding count and run token across finish, status, and render for a sealed review run", async () => {
    await assertFinishStatusAndRenderShareFindingProjection();
  });

  it("reports the finding count per disposition with the total across finish, status, and render for a sealed review run", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    const defects = await appendFindingBatch(scenario, deps, runToken, batches.defects);
    const filedOrStale = await appendFindingBatch(scenario, deps, runToken, batches.filedOrStale);
    const finishReport = await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
    const statusReport = parseStatusReport(
      (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
    );
    const renderReport = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );
    for (const counts of [finishReport.findingCounts, statusReport.findingCounts, renderReport.findingCounts]) {
      expect(counts.total).toBe(defects.length + filedOrStale.length);
      expect(counts[VERIFY_FINDING_DISPOSITION.BLOCKING] + counts[VERIFY_FINDING_DISPOSITION.DEBT]).toBe(
        defects.length,
      );
      expect(counts[VERIFY_FINDING_DISPOSITION.FILED] + counts[VERIFY_FINDING_DISPOSITION.STALE]).toBe(
        filedOrStale.length,
      );
    }
    expect(statusReport.findingCounts).toStrictEqual(finishReport.findingCounts);
    expect(renderReport.findingCounts).toStrictEqual(finishReport.findingCounts);
  });

  it("reports the finding count per disposition with the total across finish, status, and render for a sealed audit run", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.AUDIT),
    );
    const runToken = await startedRunToken(scenario, deps);
    const root = {
      ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.auditScopeUnit()),
      parentUnitId: undefined,
      coverageRequirement: AUDIT_COVERAGE_REQUIREMENT.REQUIRED,
      coverageStatus: AUDIT_COVERAGE_STATUS.AUDITED,
    };
    expect(
      (await verifyAppendScopeCommand(
        verifyAppendOptions(scenario, {
          run: runToken,
          payload: JSON.stringify(root),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        deps,
      )).exitCode,
    ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const finding = { ...sampleVerifyTestValue(arbitraryFiledOrStaleAuditFinding()), unitId: root.unitId };
    expect(
      (await verifyAppendFindingCommand(
        verifyAppendOptions(scenario, {
          run: runToken,
          payload: JSON.stringify(finding),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair()).second,
        }),
        deps,
      )).exitCode,
    ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const finishReport = await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.APPROVED);
    const statusReport = parseStatusReport(
      (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
    );
    const renderReport = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );
    const expected: VerifyFindingCounts = {
      [VERIFY_FINDING_DISPOSITION.BLOCKING]: 0,
      [VERIFY_FINDING_DISPOSITION.DEBT]: 0,
      [VERIFY_FINDING_DISPOSITION.FILED]: finding.severity === VERIFY_FINDING_DISPOSITION.FILED ? 1 : 0,
      [VERIFY_FINDING_DISPOSITION.STALE]: finding.severity === VERIFY_FINDING_DISPOSITION.STALE ? 1 : 0,
      total: 1,
    };
    expect(finishReport.findingCounts).toStrictEqual(expected);
    expect(statusReport.findingCounts).toStrictEqual(expected);
    expect(renderReport.findingCounts).toStrictEqual(expected);
    expect(finishReport.findingCount).toBe(expected.total);
  });

  it("projects status and render from the journal when a hydrated run has no recorded input file", async () => {
    await assertStatusAndRenderHydrateWithoutRecordedInput();
  });

  it("projects status and render from the journal when a terminal run has a malformed recorded input file", async () => {
    await assertStatusAndRenderHydrateWithMalformedRecordedInput();
  });

  it("rejects status and render when a terminal run has mismatched recorded-input selectors", async () => {
    await assertStatusAndRenderRejectMismatchedTerminalRecordedInput();
  });

  it("rejects status and render for an unterminal raw journal run without a recorded verification input", async () => {
    await assertStatusAndRenderRejectRawUnterminalRun();
  });

  it("rejects an unsupported verification type before resolving an existing run for status and render", async () => {
    await assertStatusAndRenderRejectUnsupportedVerificationType();
  });

  it("rejects status and render when the requested scope differs from the recorded run scope", async () => {
    await assertStatusAndRenderRejectRequestedScopeMismatch();
  });
});
