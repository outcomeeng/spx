import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  createRecordingInputReader,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseStartReport,
  readVerifyRunEvents,
  verifyAppendOptions,
  verifyStartOptions,
} from "@testing/harnesses/verify/harness";

const appendCommands = [verifyAppendScopeCommand, verifyAppendFindingCommand];

describe("verify append payload compliance", () => {
  it("requires --payload for every append verb", async () => {
    const scenario = createVerifyRunContextScenario();

    for (const command of appendCommands) {
      await fc.assert(
        fc.asyncProperty(
          VERIFY_TEST_GENERATOR.blankPayloadSource(),
          VERIFY_TEST_GENERATOR.idempotencyKey(),
          VERIFY_TEST_GENERATOR.runToken(),
          async (blankPayload, key, run) => {
            const { deps } = createVerifyAppendScenario(scenario);
            const appended = await command(
              verifyAppendOptions(scenario, { run, payload: blankPayload, idempotencyKey: key }),
              deps,
            );
            expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
            expect(appended.output).toBe(VERIFY_CLI_ERROR.PAYLOAD_REQUIRED);
          },
        ),
      );
    }
  });

  it("records the --payload evidence without reusing the recorded run input as the append channel", async () => {
    const { scenario, fs, deps: baseDeps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const inputReader = createRecordingInputReader();
    const deps = { ...baseDeps, readInputSource: inputReader.read };

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const { runToken } = parseStartReport(started.output);
    const inputReadsAfterStart = inputReader.calls();

    const scopePayload = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload());
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: JSON.stringify(scopePayload), idempotencyKey: key }),
      deps,
    );

    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    // The append never consulted the run-input channel — it read only the --payload source.
    expect(inputReader.calls()).toBe(inputReadsAfterStart);

    const scopeEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE,
    );
    expect(scopeEvents).toHaveLength(1);
    const recordedEvent = JSON.stringify(scopeEvents[0]?.data);
    for (const value of Object.values(scopePayload)) {
      expect(recordedEvent).toContain(value);
    }
  });
});
