import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyFinishCommand } from "@/commands/verify/cli";
import { findTerminalEvent, VERIFY_TERMINAL_EVENT_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRecoversUnsealedRun,
  parseFinishReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyFinishOptions,
} from "@testing/harnesses/verify/harness";

describe("verify finish compliance", () => {
  it("rejects a blank terminal status without recording completion or sealing", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.blankTerminalStatus(), async (blankStatus) => {
        const finished = await verifyFinishCommand(
          verifyFinishOptions(scenario, { run: runToken, terminalStatus: blankStatus }),
          deps,
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_REQUIRED);
      }),
    );

    expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
    // The rejected finishes neither recorded completion nor sealed: a valid finish still succeeds.
    await finishRecoversUnsealedRun(scenario, deps, runToken);
  });

  it("rejects a terminal status outside the journal terminal-status vocabulary", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.invalidTerminalStatus(), async (invalidStatus) => {
        const finished = await verifyFinishCommand(
          verifyFinishOptions(scenario, { run: runToken, terminalStatus: invalidStatus }),
          deps,
        );
        expect(finished.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(finished.output).toBe(VERIFY_CLI_ERROR.TERMINAL_STATUS_INVALID);
      }),
    );

    expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
    // The rejected finishes neither recorded completion nor sealed: a valid finish still succeeds.
    await finishRecoversUnsealedRun(scenario, deps, runToken);
  });

  it("returns the existing terminal projection for a repeated finish without appending a second terminal event", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const first = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
    expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const repeat = await verifyFinishCommand(verifyFinishOptions(scenario, { run: runToken, terminalStatus }), deps);
    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    expect(parseFinishReport(repeat.output)).toEqual(parseFinishReport(first.output));
    const terminalEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_TERMINAL_EVENT_TYPE,
    );
    expect(terminalEvents).toHaveLength(1);
  });
});
