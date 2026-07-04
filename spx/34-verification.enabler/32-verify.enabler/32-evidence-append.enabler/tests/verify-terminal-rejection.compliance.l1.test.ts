import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
} from "@/commands/verify/cli";
import { VERIFY_APPEND_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  readVerifyRunEvents,
  startedRunToken,
  verifyAppendOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

const appendCommands = [verifyAppendScopeCommand, verifyAppendFindingCommand];

describe("verify append terminal-rejection compliance", () => {
  it("rejects scope and finding evidence additions on a run carrying a terminal-completion event", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const findings = await appendFindingBatch(scenario, deps, runToken);
    await finishRun(scenario, deps, runToken, sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus()));

    const eventsBeforeReject = await readVerifyRunEvents(scenario, runToken, fs);

    for (const append of appendCommands) {
      const rejected = await append(
        verifyAppendOptions(scenario, {
          run: runToken,
          payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        deps,
      );
      expect(rejected.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(rejected.output).toBe(VERIFY_CLI_ERROR.RUN_FINISHED);
    }

    // A finished run accepts no further evidence: the sealed run's event history is unchanged and
    // its authoritative finding count still reflects only the findings appended before finish.
    const eventsAfterReject = await readVerifyRunEvents(scenario, runToken, fs);
    expect(eventsAfterReject).toEqual(eventsBeforeReject);
    expect(
      eventsAfterReject.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING),
    ).toHaveLength(findings.length);
  });
});
