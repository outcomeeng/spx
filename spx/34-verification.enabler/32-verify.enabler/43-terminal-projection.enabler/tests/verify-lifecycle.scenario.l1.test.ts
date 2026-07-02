import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  verifyFinishCommand,
} from "@/commands/verify/cli";
import { findTerminalEvent, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseFinishReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyAppendOptions,
  verifyFinishOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify finish lifecycle scenario", () => {
  it("records terminal completion, seals the journal, and reports the terminal projection from the event history", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);

    const keys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
    const scopePayload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
    const scopeAppend = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: keys.first }),
      deps,
    );
    expect(scopeAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const findings = await appendFindingBatch(scenario, deps, runToken);

    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    const finished = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
    expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const report = parseFinishReport(finished.output);
    expect(report.runToken).toBe(runToken);
    expect(report.sealed).toBe(true);
    expect(report.terminalStatus).toBe(terminalStatus);
    expect(report.findingCount).toBe(findings.length);

    const events = await readVerifyRunEvents(scenario, runToken, fs);
    expect(findTerminalEvent(events)).toBeDefined();
    expect(report.lastSequence).toBe(events.length);

    // Sealing rejects further evidence: a fresh append after finish fails on the sealed journal.
    const afterSeal = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: keys.second }),
      deps,
    );
    expect(afterSeal.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(afterSeal.output).toContain(VERIFY_CLI_ERROR.APPEND_FAILED);
  });
});
