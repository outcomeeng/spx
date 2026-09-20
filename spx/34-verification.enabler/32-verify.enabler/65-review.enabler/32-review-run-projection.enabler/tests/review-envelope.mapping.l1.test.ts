import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyAppendScopeCommand } from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { REVIEW_TERMINAL_STATE, VERIFY_FINDING_DISPOSITION } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  assertFinishStatusAndRenderProjectTerminalMetadata,
  assertReviewTerminalMetadataStateMapsTerminalStatus,
  finishRun,
  finishWithEnvelope,
  parseFinishReport,
  reviewAppendScenario,
  verifyAppendOptions,
} from "@testing/harnesses/verify/harness";

describe("review envelope projection", () => {
  it("maps terminal metadata into finish, status, and render projections", async () => {
    await assertFinishStatusAndRenderProjectTerminalMetadata();
  });

  it("maps review terminal states into terminal status", async () => {
    await assertReviewTerminalMetadataStateMapsTerminalStatus();
  });

  it("lets a run whose findings are all FILED or STALE take each envelope state's status", async () => {
    // The spec's mapping: `approved` seals approved, `changes_requested` seals rejected, and
    // `commented` preserves the caller-supplied status.
    for (const state of Object.values(REVIEW_TERMINAL_STATE)) {
      for (const callerStatus of [JOURNAL_RUN_STATE_STATUS.APPROVED, JOURNAL_RUN_STATE_STATUS.REJECTED]) {
        const terminalStatus = state === REVIEW_TERMINAL_STATE.APPROVED
          ? JOURNAL_RUN_STATE_STATUS.APPROVED
          : state === REVIEW_TERMINAL_STATE.CHANGES_REQUESTED
          ? JOURNAL_RUN_STATE_STATUS.REJECTED
          : callerStatus;
        const { scenario, deps, runToken } = await reviewAppendScenario();
        const findings = await appendFindingBatch(
          scenario,
          deps,
          runToken,
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.filedOrStaleReviewFindingBatch()),
        );
        const finished = await finishWithEnvelope(
          scenario,
          deps,
          runToken,
          terminalStatus,
          sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalMetadataForState(state)),
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
        const report = parseFinishReport(finished.output);
        expect(report.terminalStatus).toBe(terminalStatus);
        expect(report.findingCount).toBe(findings.length);
        expect(report.findingCounts.total).toBe(findings.length);
        expect(report.findingCounts[VERIFY_FINDING_DISPOSITION.BLOCKING]).toBe(0);
        expect(report.findingCounts[VERIFY_FINDING_DISPOSITION.DEBT]).toBe(0);
        expect(
          report.findingCounts[VERIFY_FINDING_DISPOSITION.FILED]
            + report.findingCounts[VERIFY_FINDING_DISPOSITION.STALE],
        ).toBe(findings.length);
      }
    }
  });

  it("lets a BLOCKING or DEBT finding, or a reviewed unit in a finding coverage state, determine rejection whatever the envelope states", async () => {
    const batches = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.mixedDispositionReviewFindingBatches());
    const withDefectFindings = await reviewAppendScenario();
    await appendFindingBatch(
      withDefectFindings.scenario,
      withDefectFindings.deps,
      withDefectFindings.runToken,
      batches.filedOrStale,
    );
    await appendFindingBatch(
      withDefectFindings.scenario,
      withDefectFindings.deps,
      withDefectFindings.runToken,
      batches.defects,
    );
    const withFindingUnit = await reviewAppendScenario();
    expect(
      (await verifyAppendScopeCommand(
        verifyAppendOptions(withFindingUnit.scenario, {
          run: withFindingUnit.runToken,
          payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.findingReviewScopeUnit())),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        withFindingUnit.deps,
      )).exitCode,
    ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    for (const { scenario, deps, runToken } of [withDefectFindings, withFindingUnit]) {
      const approved = await finishWithEnvelope(
        scenario,
        deps,
        runToken,
        JOURNAL_RUN_STATE_STATUS.APPROVED,
        sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewApprovedTerminalMetadata()),
      );
      expect(approved.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(approved.output.startsWith(VERIFY_CLI_ERROR.TERMINAL_STATUS_CONFLICT)).toBe(true);
      const rejected = await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
      expect(rejected.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.REJECTED);
    }
  });
});
