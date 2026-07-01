import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { VERIFY_APPEND_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { sampleVerifyTestValue, VERIFY_TEST_GENERATOR } from "@testing/generators/verify/verify";
import {
  createVerifyAppendScenario,
  createVerifyRunContextScenario,
  parseAppendReport,
  parseStartReport,
  readVerifyRunEvents,
  verifyAppendOptions,
  verifyStartOptions,
  withVerificationType,
} from "@testing/harnesses/verify/harness";

describe("verify append-finding compliance", () => {
  it("rejects a review finding payload that fails verification-type validation before appending an event", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    expect(started.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const { runToken } = parseStartReport(started.output);
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());

    await fc.assert(
      fc.asyncProperty(VERIFY_TEST_GENERATOR.invalidReviewFinding(), async (invalidFinding) => {
        const appended = await verifyAppendFindingCommand(
          verifyAppendOptions(scenario, {
            run: runToken,
            payload: JSON.stringify(invalidFinding),
            idempotencyKey: key,
          }),
          deps,
        );
        expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(appended.output).toBe(VERIFY_CLI_ERROR.FINDING_INVALID);
      }),
    );

    const events = await readVerifyRunEvents(scenario, runToken, fs);
    expect(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
  });

  it("records a valid review finding at the append-finding boundary so callers carry no review schema", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    const { runToken } = parseStartReport(started.output);
    const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());

    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: JSON.stringify(finding), idempotencyKey: key }),
      deps,
    );

    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseAppendReport(appended.output).sequence).toBeGreaterThanOrEqual(JOURNAL_SEQ_BASE);

    const findingEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING,
    );
    expect(findingEvents).toHaveLength(1);
    expect(JSON.stringify(findingEvents[0]?.data)).toContain(finding.summary);
  });

  it("rejects append-finding when the verification type registers no finding validator", async () => {
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
    const { scenario, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), unsupportedType),
    );

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    const { runToken } = parseStartReport(started.output);
    const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());

    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: JSON.stringify(finding), idempotencyKey: key }),
      deps,
    );

    expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(appended.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
  });
});
