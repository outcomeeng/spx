import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyFinishCommand,
} from "@/commands/verify/cli";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  attemptAppendRun,
  type AttemptedAppendRun,
  eventsOfType,
  removeRecordedInputSidecar,
  reviewRunScenario,
  runEvents,
  VERIFY_EVIDENCE_APPEND_COMMANDS,
  writeReversedScopeInputSidecar,
} from "@testing/harnesses/verify/evidence-append-observations";
import { verifyAppendOptions, verifyFinishOptions } from "@testing/harnesses/verify/harness";

/** Attempt one scope append and one finding append against `run`, returning each verb's result. */
async function appendEachVerb(run: AttemptedAppendRun) {
  const attempts = [];
  for (const command of VERIFY_EVIDENCE_APPEND_COMMANDS) {
    attempts.push({
      verb: command.name,
      result: await command(
        verifyAppendOptions(run.scenario, {
          run: run.runToken,
          payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        run.deps,
      ),
    });
  }
  return attempts;
}

describe("verify append terminal-rejection compliance", () => {
  it("rejects scope and finding evidence additions on a run carrying a terminal-completion event", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const findings = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFindingBatch());
    for (const entry of findings) {
      const appended = await verifyAppendFindingCommand(
        verifyAppendOptions(run.scenario, {
          run: run.runToken,
          payload: JSON.stringify(entry.finding),
          idempotencyKey: entry.idempotencyKey,
        }),
        run.deps,
      );
      expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    }
    const finished = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, { run: run.runToken, terminalStatus: JOURNAL_RUN_STATE_STATUS.REJECTED }),
      run.deps,
    );
    expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const eventsBefore = await runEvents(run);

    for (const attempt of await appendEachVerb(run)) {
      expect(attempt.result.exitCode, attempt.verb).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(attempt.result.output, attempt.verb).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
    }

    const eventsAfter = await runEvents(run);
    expect(eventsAfter).toEqual(eventsBefore);
    expect(eventsOfType(eventsAfter, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(findings.length);
  });

  it("rejects append on a terminal run before requiring its recorded-input sidecar", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const finished = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, {
        run: run.runToken,
        terminalStatus: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus()),
      }),
      run.deps,
    );
    expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    await removeRecordedInputSidecar(run);

    for (const attempt of await appendEachVerb(run)) {
      expect(attempt.result.exitCode, attempt.verb).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(attempt.result.output, attempt.verb).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
    }
  });

  it("rejects append on a terminal run before matching its recorded-input selectors", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const finished = await verifyFinishCommand(
      verifyFinishOptions(run.scenario, {
        run: run.runToken,
        terminalStatus: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewTerminalStatus()),
      }),
      run.deps,
    );
    expect(finished.exitCode, finished.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    await writeReversedScopeInputSidecar(run);

    for (const attempt of await appendEachVerb(run)) {
      expect(attempt.result.exitCode, attempt.verb).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(attempt.result.output, attempt.verb).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
    }
  });
});
