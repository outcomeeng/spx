import { describe, expect, it } from "vitest";

import {
  VERIFY_CLI_ERROR,
  VERIFY_CLI_EXIT_CODE,
  verifyAppendFindingCommand,
  verifyAppendScopeCommand,
} from "@/commands/verify/cli";
import { EVIDENCE_REQUIREMENT } from "@/domains/verify/evidence-rejection";
import { VERIFY_APPEND_EVENT_FIELD, VERIFY_APPEND_EVENT_TYPE } from "@/domains/verify/verify";
import { JOURNAL_SEQ_BASE } from "@/lib/agent-run-journal";
import { STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import {
  arbitraryReviewFindingMissingRequiredField,
  arbitraryReviewFindingWithoutAnchor,
  arbitraryReviewScopeMissingRequiredField,
  sampleVerifyTestValue,
  VERIFY_TEST_GENERATOR,
} from "@testing/generators/verify/verify";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  attemptAppendRun,
  createWriteRecordingFileSystem,
  eventsOfType,
  reversedChangesetScope,
  reviewRunScenario,
  runEvents,
  writtenPathsHolding,
} from "@testing/harnesses/verify/evidence-append-observations";
import {
  appendReviewFindingMissingRequiredField,
  appendReviewScopeMissingRequiredField,
  parseAppendReport,
  verifyAppendOptions,
} from "@testing/harnesses/verify/harness";

describe("verify finding evidence compliance", () => {
  it("rejects a review scope payload that fails verification-type validation before appending an event", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const eventsBefore = await runEvents(run);

    await assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewScopeUnit(),
      async (invalidScope) => {
        const appended = await verifyAppendScopeCommand(
          verifyAppendOptions(run.scenario, {
            run: run.runToken,
            payload: JSON.stringify(invalidScope),
            idempotencyKey: key,
          }),
          run.deps,
        );
        expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(appended.output.startsWith(VERIFY_CLI_ERROR.SCOPE_INVALID), appended.output).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );

    expect(await runEvents(run)).toEqual(eventsBefore);
  });

  it("rejects a review finding payload that fails verification-type validation before appending an event", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const key = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());
    const eventsBefore = await runEvents(run);

    await assertProperty(
      VERIFY_TEST_GENERATOR.invalidReviewFinding(),
      async (invalidFinding) => {
        const appended = await verifyAppendFindingCommand(
          verifyAppendOptions(run.scenario, {
            run: run.runToken,
            payload: JSON.stringify(invalidFinding),
            idempotencyKey: key,
          }),
          run.deps,
        );
        expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
        expect(appended.output.startsWith(VERIFY_CLI_ERROR.FINDING_INVALID), appended.output).toBe(true);
      },
      { level: PROPERTY_LEVEL.L1 },
    );

    expect(await runEvents(run)).toEqual(eventsBefore);
  });

  it("records a valid review scope payload through the scope-evidence validator", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const scope = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit());

    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, {
        run: run.runToken,
        payload: JSON.stringify(scope),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      run.deps,
    );

    expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseAppendReport(appended.output).sequence).toBeGreaterThanOrEqual(JOURNAL_SEQ_BASE);
    const events = await runEvents(run);
    const scopeEvents = eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE);
    expect(scopeEvents).toHaveLength(1);
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
    expect(JSON.stringify(scopeEvents[0]?.data)).toContain(scope.path);
  });

  it("records the validated evidence payload returned by the verification-type validator", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const scope = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewScopeUnit());
    const payload = {
      ...scope,
      extraProviderField: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
    };
    const idempotencyKey = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey());

    const appended = await verifyAppendScopeCommand(
      verifyAppendOptions(run.scenario, { run: run.runToken, payload: JSON.stringify(payload), idempotencyKey }),
      run.deps,
    );

    expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const scopeEvents = eventsOfType(await runEvents(run), VERIFY_APPEND_EVENT_TYPE.SCOPE);
    expect(scopeEvents).toHaveLength(1);
    expect(scopeEvents[0]?.data).toEqual({
      [VERIFY_APPEND_EVENT_FIELD.IDEMPOTENCY_KEY]: idempotencyKey,
      [VERIFY_APPEND_EVENT_FIELD.PAYLOAD]: scope,
    });
  });

  it("records a valid review finding at the finding-evidence boundary so callers carry no review schema", async () => {
    const run = await attemptAppendRun(reviewRunScenario());
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());

    const appended = await verifyAppendFindingCommand(
      verifyAppendOptions(run.scenario, {
        run: run.runToken,
        payload: JSON.stringify(finding),
        idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
      }),
      run.deps,
    );

    expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    expect(parseAppendReport(appended.output).sequence).toBeGreaterThanOrEqual(JOURNAL_SEQ_BASE);
    const findingEvents = eventsOfType(await runEvents(run), VERIFY_APPEND_EVENT_TYPE.FINDING);
    expect(findingEvents).toHaveLength(1);
    expect(JSON.stringify(findingEvents[0]?.data)).toContain(finding.finding.summary);
  });

  it("rejects finding evidence when the requested scope differs from the recorded run scope", async () => {
    // The store records every path written during start, so the test locates the run's recorded-input
    // sidecar by the input it holds rather than composing the sidecar's path through the production helper.
    const recording = createWriteRecordingFileSystem();
    const run = await attemptAppendRun(reviewRunScenario(), { fs: recording.fs });
    expect(run.started.exitCode, run.started.output).toBe(VERIFY_CLI_EXIT_CODE.OK);
    const recordedInputPaths = await writtenPathsHolding(recording, JSON.stringify(run.scenario.inputContent));
    expect(recordedInputPaths).toHaveLength(1);
    const finding = sampleVerifyTestValue(VERIFY_TEST_GENERATOR.reviewFinding());
    const eventsBefore = await runEvents(run);

    const appended = await verifyAppendFindingCommand(
      {
        ...verifyAppendOptions(run.scenario, {
          run: run.runToken,
          payload: JSON.stringify(finding),
          idempotencyKey: sampleVerifyTestValue(VERIFY_TEST_GENERATOR.idempotencyKey()),
        }),
        scope: reversedChangesetScope(run.scenario),
      },
      run.deps,
    );

    expect(appended.exitCode, appended.output).toBe(VERIFY_CLI_EXIT_CODE.ERROR);
    expect(appended.output).toContain(VERIFY_CLI_ERROR.RUN_SELECTOR_MISMATCH);
    expect(appended.output).toContain(recordedInputPaths[0]);
    expect(await runEvents(run)).toEqual(eventsBefore);
  });

  it("reports the validation reason naming the failing field when it rejects a scope payload", async () => {
    const scenario = sampleVerifyTestValue(arbitraryReviewScopeMissingRequiredField());
    const rejected = await appendReviewScopeMissingRequiredField(scenario.payload);
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(scenario.missingField);
  });

  it("reports the validation reason naming the failing field when it rejects a finding payload", async () => {
    const scenario = sampleVerifyTestValue(arbitraryReviewFindingMissingRequiredField());
    const rejected = await appendReviewFindingMissingRequiredField(scenario.payload);
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(scenario.missingField);
  });

  it("reports the unmet structural requirement when it rejects a scope payload that is not an object", async () => {
    const rejected = await appendReviewScopeMissingRequiredField(
      sampleVerifyTestValue(STATE_STORE_TEST_GENERATOR.scopeToken()),
    );
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(EVIDENCE_REQUIREMENT.PAYLOAD_IS_OBJECT);
  });

  it("reports the unmet structural requirement when it rejects a finding anchored to neither line nor position", async () => {
    const rejected = await appendReviewFindingMissingRequiredField(
      sampleVerifyTestValue(arbitraryReviewFindingWithoutAnchor()),
    );
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.output).toContain(EVIDENCE_REQUIREMENT.REVIEW_FINDING_ANCHOR);
  });
});
