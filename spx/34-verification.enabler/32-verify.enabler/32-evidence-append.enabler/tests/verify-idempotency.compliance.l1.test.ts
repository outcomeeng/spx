import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
  verifyStartCommand,
} from "@/commands/verify/cli";
import { VERIFY_APPEND_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
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

const appendCommands = [verifyAppendScopeCommand, verifyAppendFindingCommand];

describe("verify append idempotency compliance", () => {
  it("rejects unsupported verification types before reading payloads for every append verb", async () => {
    const scenario = createVerifyRunContextScenario();
    const unsupportedType = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.unsupportedVerificationType());
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
    const deps = {
      ...createVerifyAppendScenario(scenario).deps,
      readPayloadSource: async () => {
        throw new Error("verify harness: payload reader must not run");
      },
    };

    for (const command of appendCommands) {
      const appended = await command(
        {
          ...verifyAppendOptions(scenario, {
            run: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.runToken()),
            payload,
            idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
          }),
          verificationType: unsupportedType,
        },
        deps,
      );

      expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
      expect(appended.output).toBe(VERIFY_CLI_ERROR.UNSUPPORTED_VERIFICATION_TYPE);
    }
  });

  it("requires --idempotency-key for every append verb", async () => {
    const scenario = createVerifyRunContextScenario();
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));

    for (const command of appendCommands) {
      await fc.assert(
        fc.asyncProperty(
          VERIFY_TEST_GENERATOR.blankIdempotencyKey(),
          VERIFY_TEST_GENERATOR.runToken(),
          async (blankKey, run) => {
            const { deps } = createVerifyAppendScenario(scenario);
            const appended = await command(
              verifyAppendOptions(scenario, { run, payload, idempotencyKey: blankKey }),
              deps,
            );
            expect(appended.exitCode).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
            expect(appended.output).toBe(VERIFY_CLI_ERROR.IDEMPOTENCY_KEY_REQUIRED);
          },
        ),
      );
    }
  });

  it("returns the existing sequence for a repeated key and appends a fresh event only for a new key", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(createVerifyRunContextScenario());

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    const { runToken } = parseStartReport(started.output);
    const keys = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKeyPair());
    const payload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));

    const first = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload, idempotencyKey: keys.first }),
      deps,
    );
    expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const firstReport = parseAppendReport(first.output);
    expect(firstReport.idempotent).toBe(false);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(1);

    const repeat = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload, idempotencyKey: keys.first }),
      deps,
    );
    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const repeatReport = parseAppendReport(repeat.output);
    expect(repeatReport.sequence).toBe(firstReport.sequence);
    expect(repeatReport.idempotent).toBe(true);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(1);

    const fresh = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload, idempotencyKey: keys.second }),
      deps,
    );
    expect(fresh.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const freshReport = parseAppendReport(fresh.output);
    expect(freshReport.idempotent).toBe(false);
    expect(freshReport.sequence).toBeGreaterThan(firstReport.sequence);
    expect(await readVerifyRunEvents(scenario, runToken, fs)).toHaveLength(2);
  });

  it("deduplicates repeated finding evidence by idempotency key", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    const { runToken } = parseStartReport(started.output);
    const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const options = verifyAppendOptions(scenario, {
      run: runToken,
      payload: JSON.stringify(finding),
      idempotencyKey: key,
    });

    const first = await verifyAppendFindingCommand(options, deps);
    expect(first.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const repeat = await verifyAppendFindingCommand(options, deps);
    expect(repeat.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);

    expect(parseAppendReport(repeat.output).sequence).toBe(parseAppendReport(first.output).sequence);
    const findingEvents = (await readVerifyRunEvents(scenario, runToken, fs)).filter(
      (event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING,
    );
    expect(findingEvents).toHaveLength(1);
  });

  it("does not deduplicate across append kinds that reuse one idempotency key", async () => {
    const { scenario, fs, deps } = createVerifyAppendScenario(
      withVerificationType(createVerifyRunContextScenario(), VERIFY_VERIFICATION_TYPE.REVIEW),
    );

    const started = await verifyStartCommand(verifyStartOptions(scenario), deps);
    const { runToken } = parseStartReport(started.output);
    const sharedKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const scopePayload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.scopePayload()));
    const findingPayload = JSON.stringify(sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding()));

    const scopeAppend = await verifyAppendScopeCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: scopePayload, idempotencyKey: sharedKey }),
      deps,
    );
    const findingAppend = await verifyAppendFindingCommand(
      verifyAppendOptions(scenario, { run: runToken, payload: findingPayload, idempotencyKey: sharedKey }),
      deps,
    );

    expect(scopeAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(findingAppend.exitCode).toBe(VERIFY_CLI_EXIT_CODE.OK);
    // A key shared across verbs does not collide: the finding append is fresh, not a scope dedup hit.
    expect(parseAppendReport(findingAppend.output).idempotent).toBe(false);
    const events = await readVerifyRunEvents(scenario, runToken, fs);
    expect(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
    expect(events.filter((event) => event.type === VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
  });
});
