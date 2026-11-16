import { describe, expect, it } from "vitest";

import { VERIFY_CLI_ERROR, VERIFY_CLI_EXIT_CODE, type VerifyCliDeps } from "@/commands/verify/cli";
import { VERIFY_DRIVE_MODE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  attemptAppendRun,
  reviewRunScenario,
  runEvents,
  VERIFY_EVIDENCE_APPEND_COMMANDS,
} from "@testing/harnesses/verify/evidence-append-observations";
import { verifyAppendOptions } from "@testing/harnesses/verify/harness";

describe("verify append drive-mode compliance", () => {
  it("rejects a caller scope or finding append to a run recorded spx-driven at start", async () => {
    const run = await attemptAppendRun(reviewRunScenario(), { deps: { driveMode: VERIFY_DRIVE_MODE.SPX } });
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const eventsBefore = await runEvents(run);

    // An external caller over the same store asserts no spx drive mode — the append verbs expose no
    // drive-mode flag — so its deps carry caller-driven mode and a payload reader, unlike the executor's
    // own recorder operations that assert spx drive mode.
    const externalCaller: VerifyCliDeps = {
      ...run.deps,
      driveMode: VERIFY_DRIVE_MODE.CALLER,
      readPayloadSource: async (source) => source,
    };

    for (const appendCommand of VERIFY_EVIDENCE_APPEND_COMMANDS) {
      const rejected = await appendCommand(
        verifyAppendOptions(run.scenario, {
          run: run.runToken,
          payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken())),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        externalCaller,
      );
      expect(rejected.exitCode, appendCommand.name).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(rejected.output, appendCommand.name).toBe(VERIFY_CLI_ERROR.SPX_DRIVEN_APPEND_REJECTED);
    }

    expect(await runEvents(run)).toEqual(eventsBefore);
  });
});
