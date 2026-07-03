import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyAppendScopeCommand, verifyRenderCommand } from "@/commands/verify/cli";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseRenderReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyAppendOptions,
  verifyRenderOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify render compliance", () => {
  it("projects an unsealed run read-only, reporting sealed:false with no terminal status, appending no event, and sealing no run", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const findings = await appendFindingBatch(scenario, deps, runToken);

    // The run is started with appended findings but never finished, so no terminal event exists.
    const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
    expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const report = parseRenderReport(rendered.output);
    expect(report.runToken).toBe(runToken);
    expect(report.sealed).toBe(false);
    expect(report.terminalStatus).toBeUndefined();
    expect(report.findingCount).toBe(findings.length);
    expect(report.events).toHaveLength(eventsBeforeRender.length);

    // render appends no journal event: the unsealed run's event history is unchanged.
    const eventsAfterRender = await readVerifyRunEvents(scenario, runToken, fs);
    expect(eventsAfterRender).toHaveLength(eventsBeforeRender.length);

    // render seals no run: the run still accepts evidence. Because a projected sealed state folds
    // from the terminal event and not the backend seal marker, a render that silently wrote the
    // seal marker would leave `report.sealed` false yet reject this append with JOURNAL_ERROR.SEALED.
    const appendAfterRender = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(appendAfterRender.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length + 1);
  });
});
