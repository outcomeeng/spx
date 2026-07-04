import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD,
  verifyAppendScopeCommand,
  verifyRenderCommand,
  verifyStatusCommand,
} from "@/commands/verify/cli";
import {
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_SCOPE_SEPARATOR,
  VERIFY_SCOPE_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  parseRenderReport,
  parseStatusReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyAppendOptions,
  verifyInputRecordFilePath,
  verifyRenderOptions,
  verifyStatusOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify status compliance", () => {
  it("reports run token, verification type, scope type, unsealed state, last sequence, and next legal actions for a started run", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);

    const scopeAppend = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(scopeAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
    expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseStatusReport(status.output);

    expect(report.runToken).toBe(runToken);
    expect(report.verificationType).toBe(scenario.verificationType);
    expect(report.scopeType).toBe(VERIFY_SCOPE_TYPE.CHANGESET);
    expect(report.sealed).toBe(false);
    expect(report.terminalStatus).toBeUndefined();
    // Exact set equality plus cardinality, not membership: an unintended UNSEALED_NEXT_ACTIONS
    // entry (a new action or a duplicate) must fail here.
    const expectedUnsealedActions = [
      VERIFY_LIFECYCLE_ACTION.SCOPE_ADD,
      VERIFY_LIFECYCLE_ACTION.FINDING_ADD,
      VERIFY_LIFECYCLE_ACTION.FINISH,
    ];
    expect(new Set(report.nextActions)).toEqual(new Set(expectedUnsealedActions));
    expect(report.nextActions).toHaveLength(expectedUnsealedActions.length);
    // last journal sequence tracks the run's own event history, read independently.
    expect(report.lastSequence).toBe((await readVerifyRunEvents(scenario, runToken, fs)).length);
  });

  it("reports sealed state, terminal status, and no remaining lifecycle actions after finish", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    await finishRun(scenario, deps, runToken, terminalStatus);

    const report = parseStatusReport(
      (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
    );
    expect(report.sealed).toBe(true);
    expect(report.terminalStatus).toBe(terminalStatus);
    expect(report.nextActions).toHaveLength(0);
    expect(report.lastSequence).toBe((await readVerifyRunEvents(scenario, runToken, fs)).length);
  });

  it("reports the same authoritative finding count and run token across finish, status, and render for a sealed review run", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const finishReport = await finishRun(scenario, deps, runToken, terminalStatus);
    const statusReport = parseStatusReport(
      (await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps)).output,
    );
    const renderReport = parseRenderReport(
      (await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps)).output,
    );

    expect(finishReport.findingCount).toBe(findings.length);
    expect(statusReport.findingCount).toBe(findings.length);
    expect(renderReport.findingCount).toBe(findings.length);
    expect(finishReport.runToken).toBe(runToken);
    expect(statusReport.runToken).toBe(runToken);
    expect(renderReport.runToken).toBe(runToken);
  });

  it("projects status and render from the journal when a hydrated run has no recorded input file", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    await finishRun(scenario, deps, runToken, terminalStatus);
    await fs.rm(verifyInputRecordFilePath(scenario, runToken), { force: true });

    const status = await verifyStatusCommand(verifyStatusOptions(scenario, runToken), deps);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);

    expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const statusReport = parseStatusReport(status.output);
    const renderReport = parseRenderReport(rendered.output);
    expect(statusReport.runToken).toBe(runToken);
    expect(renderReport.runToken).toBe(runToken);
    expect(statusReport.findingCount).toBe(findings.length);
    expect(renderReport.findingCount).toBe(findings.length);
    expect(statusReport.terminalStatus).toBe(terminalStatus);
    expect(renderReport.terminalStatus).toBe(terminalStatus);
  });

  it("rejects status and render when the requested scope differs from the recorded run scope", async () => {
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const mismatchedScope = `${scenario.head}${VERIFY_SCOPE_SEPARATOR}${scenario.base}`;

    const status = await verifyStatusCommand(
      { ...verifyStatusOptions(scenario, runToken), scope: mismatchedScope },
      deps,
    );
    const rendered = await verifyRenderCommand(
      { ...verifyRenderOptions(scenario, runToken), scope: mismatchedScope },
      deps,
    );

    expect(status.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(status.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
    expect(rendered.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
    expect(status.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
    expect(rendered.output).toContain(`${VERIFY_RUN_NOT_FOUND_DIAGNOSTIC_FIELD.RUN}${runToken}`);
    expect(status.output).toContain(verifyInputRecordFilePath(scenario, runToken));
    expect(rendered.output).toContain(verifyInputRecordFilePath(scenario, runToken));
  });
});
