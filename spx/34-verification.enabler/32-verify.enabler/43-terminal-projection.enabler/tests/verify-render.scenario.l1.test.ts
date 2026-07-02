import { describe, expect, it } from "vitest";

import { VERIFY_CLI_EXIT_CODE, verifyRenderCommand } from "@/commands/verify/cli";
import { VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  appendFindingBatch,
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  finishRun,
  parseRenderReport,
  readVerifyRunEvents,
  startedRunToken,
  verifyRenderOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify render scenario", () => {
  it("renders the sealed run's journal projection with the authoritative finding count and appends no event", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );
    const runToken = await startedRunToken(scenario, deps);
    const findings = await appendFindingBatch(scenario, deps, runToken);
    const terminalStatus = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.terminalStatus());
    await finishRun(scenario, deps, runToken, terminalStatus);

    const eventsBeforeRender = await readVerifyRunEvents(scenario, runToken, fs);
    const rendered = await verifyRenderCommand(verifyRenderOptions(scenario, runToken), deps);
    expect(rendered.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    const report = parseRenderReport(rendered.output);
    expect(report.runToken).toBe(runToken);
    expect(report.sealed).toBe(true);
    expect(report.terminalStatus).toBe(terminalStatus);
    expect(report.findingCount).toBe(findings.length);
    expect(report.events).toHaveLength(eventsBeforeRender.length);

    // render is read-only: the event history is unchanged after the projection.
    const eventsAfterRender = await readVerifyRunEvents(scenario, runToken, fs);
    expect(eventsAfterRender).toHaveLength(eventsBeforeRender.length);
  });
});
