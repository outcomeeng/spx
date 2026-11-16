import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendScopeCommand,
  verifyFinishCommand,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  findTerminalEvent,
  REVIEW_SCOPE_COVERAGE_STATE,
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_VERIFICATION_TYPE,
} from "@/domains/verify/verify";
import {
  APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT,
  appendableJournalSealMarkerPath,
} from "@/lib/appendable-journal-store";
import { STATE_STORE_TEXT_ENCODING } from "@/lib/state-store";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseFinishReport,
  parseStartReport,
  readVerifyRunEvents,
  verifyAppendOptions,
  verifyFinishOptions,
  verifyStartOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify finish lifecycle scenario", () => {
  it("records terminal completion, seals the journal, and reports the terminal projection from the event history", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode, started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const startReport = parseStartReport(started.output);
    const runToken = startReport.runToken;
    const keys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
    const scopePayload = JSON.stringify({
      ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
      coverageState: REVIEW_SCOPE_COVERAGE_STATE.CLEAN,
    });
    const scopeAppend = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: keys.first }),
      deps,
    );
    expect(scopeAppend.exitCode, scopeAppend.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const terminalStatus = JOURNAL_RUN_STATE_STATUS.REJECTED;

    const finished = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);

    expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseFinishReport(finished.output);
    const events = await readVerifyRunEvents(scenario, runToken, fs);
    expect(report.runToken).toBe(runToken);
    expect(report.sealed).toBe(true);
    expect(report.terminalStatus).toBe(terminalStatus);
    expect(report.findingCount).toBe(findings.length);
    expect(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(findings.length);
    expect(findTerminalEvent(events)).toBeDefined();
    expect(report.lastSequence).toBe(events.length);
    await expect(
      fs.readFile(appendableJournalSealMarkerPath(startReport.locator.runTarget), STATE_STORE_TEXT_ENCODING),
    ).resolves.toBe(APPENDABLE_JOURNAL_SEAL_MARKER_CONTENT);

    const afterFinish = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: keys.second }),
      deps,
    );
    expect(afterFinish.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(afterFinish.output).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
  });
});
