import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyAppendScopeCommand } from "@/commands/verify/cli";
import { VERIFY_APPEND_EVENT_FIELD, VERIFY_APPEND_EVENT_TYPE, VERIFY_SCOPE_ERROR } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  attemptAppendRun,
  eventsOfType,
  reviewRunScenario,
  runEvents,
  VERIFY_EVIDENCE_APPEND_COMMANDS,
} from "@testing/harnesses/verify/evidence-append-observations";
import {
  createRecordingInputReader,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  verifyAppendOptions,
} from "@testing/harnesses/verify/harness";

/** A payload reader that fails if called, so an append that reads its payload cannot pass as rejected-before-read. */
function refusingPayloadReader(payload: string): () => Promise<string> {
  return async () => {
    throw new Error(payload);
  };
}

describe("verify append payload compliance", () => {
  it("requires --payload for every append verb", async () => {
    const scenario = createVerifyRunContextScenario();

    for (const command of VERIFY_EVIDENCE_APPEND_COMMANDS) {
      await assertProperty(
        fc.tuple(
          VERIFY_TEST_GENERATOR.blankPayloadSource(),
          VERIFY_TEST_GENERATOR.idempotencyKey(),
          VERIFY_TEST_GENERATOR.runToken(),
        ),
        async ([blankPayload, key, run]) => {
          const { deps } = createVerifyAppendScenario(scenario);
          const appended = await command(
            verifyAppendOptions(scenario, { run, payload: blankPayload, idempotencyKey: key }),
            deps,
          );
          expect(appended.exitCode, command.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
          expect(appended.output, command.name).toBe(VERIFY_CLI_ERROR.PAYLOAD_REQUIRED);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    }
  });

  it("rejects unsupported scope types for every append verb before reading payloads", async () => {
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
    const run = await attemptAppendRun(reviewRunScenario(), {
      deps: { readPayloadSource: refusingPayloadReader(payload) },
    });
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const eventsBefore = await runEvents(run);

    for (const command of VERIFY_EVIDENCE_APPEND_COMMANDS) {
      const appended = await command(
        {
          ...verifyAppendOptions(run.scenario, {
            run: run.runToken,
            payload,
            idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
          }),
          scopeType: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedScopeType()),
        },
        run.deps,
      );

      expect(appended.exitCode, command.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.output, command.name).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);
      expect(await runEvents(run), command.name).toStrictEqual(eventsBefore);
    }
  });

  it("rejects malformed changeset scopes for every append verb before reading payloads", async () => {
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
    const run = await attemptAppendRun(reviewRunScenario(), {
      deps: { readPayloadSource: refusingPayloadReader(payload) },
    });
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const eventsBefore = await runEvents(run);

    for (const command of VERIFY_EVIDENCE_APPEND_COMMANDS) {
      const appended = await command(
        {
          ...verifyAppendOptions(run.scenario, {
            run: run.runToken,
            payload,
            idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
          }),
          scope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangesetScope()),
        },
        run.deps,
      );

      expect(appended.exitCode, command.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.output, command.name).toBe(VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET);
      expect(await runEvents(run), command.name).toStrictEqual(eventsBefore);
    }
  });

  it("records the --payload evidence without reusing the recorded run input as the append channel", async () => {
    const inputReader = createRecordingInputReader();
    const run = await attemptAppendRun(reviewRunScenario(), { deps: { readInputSource: inputReader.read } });
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const inputReadsAfterStart = inputReader.calls();
    const scopePayload = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload());
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());

    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, {
        run: run.runToken,
        payload: JSON.stringify(scopePayload),
        idempotencyKey: key,
      }),
      run.deps,
    );

    expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(inputReader.calls()).toBe(inputReadsAfterStart);
    const scopeEvents = eventsOfType(await runEvents(run), VERIFY_APPEND_EVENT_TYPE.SCOPE);
    expect(scopeEvents).toHaveLength(1);
    expect(scopeEvents[0]?.data).toEqual({
      [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: key,
      [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: scopePayload,
    });
  });
});
