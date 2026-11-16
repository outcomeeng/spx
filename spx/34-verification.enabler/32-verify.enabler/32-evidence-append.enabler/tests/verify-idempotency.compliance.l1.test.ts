import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
} from "@/commands/verify/cli";
import { REVIEW_SCOPE_COVERAGE_STATE, VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  type AttemptedAppendRun,
  attemptAppendRun,
  eventsOfType,
  reviewRunScenario,
  runEvents,
  VERIFY_EVIDENCE_APPEND_COMMANDS,
} from "@testing/harnesses/verify/evidence-append-observations";
import {
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseAppendReport,
  verifyAppendOptions,
} from "@testing/harnesses/verify/harness";

/** The scope and finding evidence a run's journal holds, excluding its run-context and terminal events. */
async function evidenceEventCount(run: AttemptedAppendRun): Promise<number> {
  const events = await runEvents(run);
  return eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE).length
    + eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING).length;
}

describe("verify append idempotency compliance", () => {
  it("rejects unsupported verification types before reading payloads for every append verb", async () => {
    const scenario = createVerifyRunContextScenario();
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
    const deps = {
      ...createVerifyAppendScenario(scenario).deps,
      readPayloadSource: async () => {
        throw new Error(payload);
      },
    };

    for (const command of VERIFY_EVIDENCE_APPEND_COMMANDS) {
      const appended = await command(
        {
          ...verifyAppendOptions(scenario, {
            run: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken()),
            payload,
            idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
          }),
          verificationType: unsupportedType,
        },
        deps,
      );

      expect(appended.exitCode, command.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.output, command.name).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    }
  });

  it("requires --idempotency-key for every append verb", async () => {
    const scenario = createVerifyRunContextScenario();
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));

    for (const command of VERIFY_EVIDENCE_APPEND_COMMANDS) {
      await assertProperty(
        fc.tuple(VERIFY_TEST_GENERATOR.blankIdempotencyKey(), VERIFY_TEST_GENERATOR.runToken()),
        async ([blankKey, run]) => {
          const { deps } = createVerifyAppendScenario(scenario);
          const appended = await command(
            verifyAppendOptions(scenario, { run, payload, idempotencyKey: blankKey }),
            deps,
          );
          expect(appended.exitCode, command.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(appended.output, command.name).toBe(VERIFY_CLI_ERROR.IDEMPOTENCY_KEY_REQUIRED);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    }
  });

  it("returns the existing sequence for a repeated key and appends a fresh event only for a new key", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const keys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));

    const first = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, { run: run.runToken, payload, idempotencyKey: keys.first }),
      run.deps,
    );
    expect(first.exitCode, first.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const firstReport = parseAppendReport(first.output);
    expect(firstReport.idempotent).toBe(false);
    expect(await evidenceEventCount(run)).toBe(1);

    const repeat = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, { run: run.runToken, payload, idempotencyKey: keys.first }),
      run.deps,
    );
    expect(repeat.exitCode, repeat.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const repeatReport = parseAppendReport(repeat.output);
    expect(repeatReport.sequence).toBe(firstReport.sequence);
    expect(repeatReport.idempotent).toBe(true);
    expect(await evidenceEventCount(run)).toBe(1);

    const fresh = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, { run: run.runToken, payload, idempotencyKey: keys.second }),
      run.deps,
    );
    expect(fresh.exitCode, fresh.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const freshReport = parseAppendReport(fresh.output);
    expect(freshReport.idempotent).toBe(false);
    expect(freshReport.sequence).toBeGreaterThan(firstReport.sequence);
    expect(await evidenceEventCount(run)).toBe(2);
  });

  it("deduplicates repeated finding evidence by idempotency key", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const options = verifyAppendOptions(run.scenario, {
      run: run.runToken,
      payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding())),
      idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    });

    const first = await verifyAppendFindingCommand(options, run.deps);
    const repeat = await verifyAppendFindingCommand(options, run.deps);

    expect(first.exitCode, first.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(repeat.exitCode, repeat.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseAppendReport(repeat.output).sequence).toBe(parseAppendReport(first.output).sequence);
    expect(eventsOfType(await runEvents(run), VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
  });

  it("does not deduplicate across append kinds that reuse one idempotency key", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const sharedKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const scopePayload = JSON.stringify({
      ...sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit()),
      coverageState: REVIEW_SCOPE_COVERAGE_STATE.CLEAN,
    });
    const findingPayload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding()));

    const scopeAppend = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, { run: run.runToken, payload: scopePayload, idempotencyKey: sharedKey }),
      run.deps,
    );
    const findingAppend = await verifyAppendFindingCommand(
      verifyAppendOptions(run.scenario, { run: run.runToken, payload: findingPayload, idempotencyKey: sharedKey }),
      run.deps,
    );

    expect(scopeAppend.exitCode, scopeAppend.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(findingAppend.exitCode, findingAppend.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseAppendReport(findingAppend.output).idempotent).toBe(false);
    const events = await runEvents(run);
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
  });
});
