import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyRenderCommand,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  VERIFY_FINDING_DISPOSITION,
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { arbitraryFileAuditScopeScenario } from "@testing/generators/verify/audit";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createRecordingGitDeps,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  openRawJournalRun,
  parseRenderReport,
  parseStatusReport,
  readRunReports,
  readVerifyRunEvents,
  reviewAppendScenario,
  startedRunToken,
  testAppendScenario,
  verifyAppendOptions,
  verifyInputRecordFilePath,
  verifyRenderOptions,
  verifyStatusOptions,
  withFileScope,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify status compliance", () => {
  it("reports run token, verification type, scope type, unsealed state, last sequence, and next legal actions for a started run", async () => {
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    const scopeAppend = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(scopeAppend.exitCode, scopeAppend.output).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);

    expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseStatusReport(status.output);
    expect(report.runToken).toBe(runToken);
    expect(report.verificationType).toBe(scenario.verificationType);
    expect(report.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
    expect(report.sealed).toBe(false);
    expect(report.terminalStatus).toBeUndefined();
    const expectedUnsealedActions = [
      VERIFY_LIFECYCLE_ACTION.SCOPE_ADD,
      VERIFY_LIFECYCLE_ACTION.FINDING_ADD,
      VERIFY_LIFECYCLE_ACTION.FINISH,
    ];
    expect(new Set(report.nextActions)).toEqual(new Set(expectedUnsealedActions));
    expect(report.nextActions).toHaveLength(expectedUnsealedActions.length);
    expect(report.lastSequence).toBe((await readVerifyRunEvents(scenario, runToken, fs)).length);
  });

  it("reports sealed state, terminal status, and no remaining lifecycle actions after finish", async () => {
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus());
    await finishRun(scenario, deps, runToken, terminalStatus);

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);

    expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseStatusReport(status.output);
    expect(report.sealed).toBe(true);
    expect(report.terminalStatus).toBe(terminalStatus);
    expect(report.nextActions).toHaveLength(0);
    expect(report.lastSequence).toBe((await readVerifyRunEvents(scenario, runToken, fs)).length);
  });

  it("reports the same authoritative finding count and run token across finish, status, and render for a sealed review run", async () => {
    const { scenario, deps, runToken } = await reviewAppendScenario();
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const finishReport = await finishRun(scenario, deps, runToken, JOURNAL_RUN_STATE_STATUS.REJECTED);
    const reports = await readRunReports(scenario, deps, runToken);
    for (const report of [finishReport, reports.status, reports.render]) {
      expect(report.findingCount).toBe(findings.length);
      expect(report.runToken).toBe(runToken);
    }
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
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
    await finishRun(scenario, deps, runToken, terminalStatus);
    await fs.rm(verifyInputRecordFilePath(scenario, runToken), { force: true });

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);

    expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    for (const report of [parseStatusReport(status.output), parseRenderReport(rendered.output)]) {
      expect(report.runToken).toBe(runToken);
      expect(report.findingCount).toBe(findings.length);
      expect(report.terminalStatus).toBe(terminalStatus);
    }
  });

  it("projects status and render from the journal when a terminal run has a malformed recorded input file", async () => {
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;
    await finishRun(scenario, deps, runToken, terminalStatus);
    // A recorded-input file carrying no scope selectors is malformed rather than conflicting.
    await fs.writeFile(
      verifyInputRecordFilePath(scenario, runToken),
      JSON.stringify({ source: terminalStatus, digest: runToken, content: scenario.inputContent }),
    );

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);

    expect(status.exitCode, status.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    for (const report of [parseStatusReport(status.output), parseRenderReport(rendered.output)]) {
      expect(report.findingCount).toBe(findings.length);
      expect(report.terminalStatus).toBe(terminalStatus);
    }
  });

  it("rejects status and render when a terminal run has mismatched recorded-input selectors", async () => {
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    await finishRun(scenario, deps, runToken, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus()));
    // The recorded input names the reversed range, so its selector conflicts with the requested one.
    await fs.writeFile(
      verifyInputRecordFilePath(scenario, runToken),
      JSON.stringify({
        scopeIdentity: `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`,
        scopeType: VERIFY_SCOPE_TYPE.CHANGESET,
        source: scenario.inputContent,
        digest: runToken,
        content: scenario.inputContent,
      }),
    );

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);

    for (const result of [status, rendered]) {
      expect(result.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(result.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
      expect(result.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
      expect(result.output).toContain(verifyInputRecordFilePath(scenario, runToken));
    }
  });

  it("rejects status and render for an unterminal raw journal run without a recorded verification input", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const rawRun = await openRawJournalRun(scenario, deps);

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, rawRun.runToken), deps);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, rawRun.runToken), deps);

    for (const result of [status, rendered]) {
      expect(result.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(result.output).toContain(VERIFY_CLI_ERROR.RUN_NOT_FOUND);
      expect(result.output).toContain(verifyInputRecordFilePath(scenario, rawRun.runToken));
    }
  });

  it("rejects an unsupported verification type before resolving an existing run for status and render", async () => {
    const scenario = createVerifyRunContextScenario();
    const { deps } = createVerifyAppendScenario(scenario);
    const recorder = createRecordingGitDeps();
    const recordingDeps = { ...deps, git: recorder.git };
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
    const runToken = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken());

    const status = await verifyStatusCommand(
      { ...verifyStatusOptions(scenario, runToken), verificationType: unsupportedType },
      recordingDeps,
    );
    const rendered = await verifyRenderCommand(
      { ...verifyRenderOptions(scenario, runToken), verificationType: unsupportedType },
      recordingDeps,
    );

    for (const result of [status, rendered]) {
      expect(result.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(result.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    }
    // Neither command resolved a run: the recording Git double saw no call.
    expect(recorder.calls()).toBe(0);
  });

  it("rejects status and render when the requested scope differs from the recorded run scope", async () => {
    const { scenario, deps, runToken } = await reviewAppendScenario();
    const mismatchedScope = `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`;

    const status = await verifyStatusCommand(
      { ...verifyStatusOptions(scenario, runToken), scope: mismatchedScope },
      deps,
    );
    const rendered = await verifyRenderCommand(
      { ...verifyRenderOptions(scenario, runToken), scope: mismatchedScope },
      deps,
    );

    for (const result of [status, rendered]) {
      expect(result.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(result.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
      expect(result.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
      expect(result.output).toContain(verifyInputRecordFilePath(scenario, runToken));
    }
  });
});
