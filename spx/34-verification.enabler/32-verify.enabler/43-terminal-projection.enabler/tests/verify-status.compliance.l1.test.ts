import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyAppendFindingCommand, verifyAppendScopeCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_FINDING_DISPOSITION, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
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
  readRunReports,
  reviewAppendScenario,
  startedRunToken,
  testAppendScenario,
  verifyAppendOptions,
  withFileScope,
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

  it("reports the finding count per disposition with the total across finish, status, and render for sealed review and audit runs", async () => {
    // One sealed review run recording defect and filed-or-stale findings, and one sealed audit run
    // recording filed-or-stale findings; each pairs its run with the dispositions it recorded, in
    // the spec's lower-case spelling.
    const review = await reviewAppendScenario();
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    const reviewRecorded = [
      ...(await appendFindingBatch(review.scenario, review.deps, review.runToken, batches.defects)),
      ...(await appendFindingBatch(review.scenario, review.deps, review.runToken, batches.filedOrStale)),
    ].map((entry) => entry.finding.finding.disposition.toLowerCase());
    const audit = createVerifyAppendScenario(
      withFileScope(
        withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.AUDIT),
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      ),
    );
    const auditRunToken = await startedRunToken(audit.scenario, audit.deps);
    const auditAppends = [
      {
        payload: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootPayload,
        idempotencyKey: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootAppendKey,
        command: verifyAppendScopeCommand,
      },
      ...sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).filedOrStaleFindingAppends.map((append) => ({
        ...append,
        command: verifyAppendFindingCommand,
      })),
    ];
    for (const append of auditAppends) {
      expect(
        (await append.command(
          verifyAppendOptions(audit.scenario, {
            run: auditRunToken,
            payload: JSON.stringify(append.payload),
            idempotencyKey: append.idempotencyKey,
          }),
          audit.deps,
        )).exitCode,
      ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    }
    const auditRecorded = sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).filedOrStaleFindingPayloads.map(
      (payload) => (payload as { readonly severity: string }).severity,
    );
    for (
      const [scenario, deps, runToken, terminalStatus, recorded] of [
        [review.scenario, review.deps, review.runToken, JOURNAL_RUN_STATE_STATUS.REJECTED, reviewRecorded],
        [audit.scenario, audit.deps, auditRunToken, JOURNAL_RUN_STATE_STATUS.APPROVED, auditRecorded],
      ] as const
    ) {
      const finishReport = await finishRun(scenario, deps, runToken, terminalStatus);
      const reports = await readRunReports(scenario, deps, runToken);
      for (const report of [finishReport, reports.status, reports.render]) {
        expect(report.runToken).toBe(runToken);
        expect(report.findingCount).toBe(recorded.length);
        expect(report.findingCounts.total).toBe(recorded.length);
        for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
          expect(report.findingCounts[disposition]).toBe(recorded.filter((value) => value === disposition).length);
        }
      }
    }
  });

  it("reports a sealed test run's failing cases in the total and under no disposition class", async () => {
    const { scenario, deps, runToken } = await testAppendScenario();
    expect(
      (await verifyAppendFindingCommand(
        verifyAppendOptions(scenario, {
          run: runToken,
          payload: JSON.stringify(sampleVerifyTestValue(JOURNAL_REPORTER_TEST_GENERATOR.finding())),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        deps,
      )).exitCode,
    ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const finishReport = await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.FAILED);
    const reports = await readRunReports(scenario, deps, runToken);
    for (const report of [finishReport, reports.status, reports.render]) {
      expect(report.runToken).toBe(runToken);
      expect(report.findingCount).toBe(1);
      expect(report.findingCounts.total).toBe(report.findingCount);
      for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
        expect(report.findingCounts[disposition]).toBe(0);
      }
    }
    for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
      expect(reports.render.findings[disposition]).toStrictEqual([]);
    }
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
