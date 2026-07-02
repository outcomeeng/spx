import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, verifyFinishCommand } from "@/commands/verify/cli";
import {
  findTerminalEvent,
  VERIFY_SCOPE_ERROR,
  VERIFY_SCOPE_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
} from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRecoversUnsealedRun,
  finishRun,
  parseFinishReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyDeps,
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

  it("returns the first terminal projection when a second finish supplies a different terminal status", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const statuses = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.distinctTerminalStatuses());

    const first = await finishRun(scenario, deps, runToken, statuses.first);
    const second = await finishRun(scenario, deps, runToken, statuses.second);

    // First status wins: the second finish returns the recorded projection, not the new status.
    expect(second.terminalStatus).toBe(statuses.first);
    expect(second).toEqual(first);
    const terminalEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_TERMINAL_EVENT_TYPE,
    );
    expect(terminalEvents).toHaveLength(1);
    expect(JSON.stringify(terminalEvents[0]?.data)).not.toContain(statuses.second);
  });

  it("returns the idempotent terminal projection without a journal binding", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    const first = await finishRun(scenario, deps, runToken, terminalStatus);

    // The idempotent return is read-only, so a finish with no journal binding still returns it.
    const readOnlyDeps = verifyDeps(scenario, fs);
    const repeat = await verifyFinishCommand(
      verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
      readOnlyDeps,
    );
    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseFinishReport(repeat.output)).toEqual(first);
  });

  it("rejects an unsupported scope type or a malformed changeset scope before mutating the run", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());
    const runToken = await startedRunToken(scenario, deps);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());

    const unsupportedType = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
        scopeType: VERIFY_SCOPE_TYPE.WORKING_TREE,
      },
      deps,
    );
    expect(unsupportedType.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(unsupportedType.output).toBe(VERIFY_SCOPE_ERROR.UNSUPPORTED_SCOPE_TYPE);

    const malformedScope = await verifyFinishCommand(
      {
        ...verifyFinishOptions(scenario, { run: runToken, terminalStatus }),
        scope: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.malformedChangesetScope()),
      },
      deps,
    );
    expect(malformedScope.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(malformedScope.output).toBe(VERIFY_SCOPE_ERROR.MALFORMED_CHANGESET);

    // A rejected finish never records terminal completion.
    expect(findTerminalEvent(await readVerifyRunEvents(scenario, runToken, fs))).toBeUndefined();
  });
});
