import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyRenderCommand,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_FINDING_DISPOSITION, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
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
  parseRenderReport,
  parseStatusReport,
  startedRunToken,
  verifyAppendOptions,
  verifyRenderOptions,
  verifyStatusOptions,
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
    // The spec spells a review disposition in upper case and its count in lower case.
    const recorded = [...defects, ...filedOrStale].map((entry) => entry.finding.finding.disposition.toLowerCase());
    for (const report of [finishReport, statusReport, renderReport]) {
      expect(report.runToken).toBe(runToken);
      expect(report.findingCount).toBe(recorded.length);
      expect(report.findingCounts.total).toBe(recorded.length);
      for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
        expect(report.findingCounts[disposition]).toBe(recorded.filter((value) => value === disposition).length);
      }
    }
  });

  it("reports the finding count per disposition with the total across finish, status, and render for a sealed audit run", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withFileScope(
        withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.AUDIT),
        sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).scopeIdentity,
      ),
    );
    const runToken = await startedRunToken(scenario, deps);
    expect(
      (await verifyAppendScopeCommand(
        verifyAppendOptions(scenario, {
          run: runToken,
          payload: JSON.stringify(sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootPayload),
          idempotencyKey: sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).rootAppendKey,
        }),
        deps,
      )).exitCode,
    ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    for (const append of sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).filedOrStaleFindingAppends) {
      expect(
        (await verifyAppendFindingCommand(
          verifyAppendOptions(scenario, {
            run: runToken,
            payload: JSON.stringify(append.payload),
            idempotencyKey: append.idempotencyKey,
          }),
          deps,
        )).exitCode,
      ).toBe(VERIFY_CLI_EXIT_CODE.OK);
    }
    const finishReport = await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.APPROVED);
    const statusReport = parseStatusReport(
      (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
    );
    const renderReport = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );
    const recorded = sampleVerifyTestValue(arbitraryFileAuditScopeScenario()).filedOrStaleFindingPayloads.map(
      (payload) => (payload as { readonly severity: string }).severity,
    );
    for (const report of [finishReport, statusReport, renderReport]) {
      expect(report.runToken).toBe(runToken);
      expect(report.findingCount).toBe(recorded.length);
      expect(report.findingCounts.total).toBe(recorded.length);
      for (const disposition of Object.values(VERIFY_FINDING_DISPOSITION)) {
        expect(report.findingCounts[disposition]).toBe(recorded.filter((value) => value === disposition).length);
      }
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
