import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyAppendScopeCommand, verifyRenderCommand } from "@/commands/verify/cli";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  parseRenderReport,
  readVerifyRunEvents,
  reviewAppendScenario,
  verifyAppendOptions,
  verifyRenderOptions,
} from "@testing/harnesses/verify/harness";

describe("verify render compliance", () => {
  it("projects an unsealed run read-only, reporting sealed:false with no terminal status, appending no event, and sealing no run", async () => {
    const { scenario, fs, deps, runToken } = await reviewAppendScenario();
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);

    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);

    expect(rendered.exitCode, rendered.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const report = parseRenderReport(rendered.output);
    expect(report.runToken).toBe(runToken);
    expect(report.sealed).toBe(false);
    expect(report.terminalStatus).toBeUndefined();
    expect(report.findingCount).toBe(findings.length);
    expect(report.events).toHaveLength(eventsBeforeRender.length);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length);

    // Render sealed nothing: the run still accepts evidence afterwards.
    const appendAfterRender = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, {
        run: runToken,
        payload: JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload())),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      deps,
    );
    expect(appendAfterRender.exitCode, appendAfterRender.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(eventsBeforeRender.length + 1);
  });
});
