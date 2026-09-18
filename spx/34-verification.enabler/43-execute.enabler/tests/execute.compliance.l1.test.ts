import { describe, expect, it } from "vitest";

import { RECORDER_OPERATION_ERROR } from "@/commands/verification-exec";
import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import {
  VERIFY_APPEND_EVENT_TYPE,
  VERIFY_DRIVE_MODE,
  VERIFY_EVENT_SOURCE,
  VERIFY_LIFECYCLE_ACTION,
  VERIFY_RUN_CONTEXT_EVENT_TYPE,
  VERIFY_TERMINAL_EVENT_TYPE,
} from "@/domains/verify/verify";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";
import {
  eventsOfType,
  gatedOutDescriptor,
  nonStreamingDescriptor,
  observeDriveModeAroundSeal,
  observeExecutorRun,
  observeOverlappingAppends,
  observeProductionRegistryDrive,
  observeRecorderLifecycleFailures,
  observeRegistryResolution,
  observeRejectedAppendAmongQueued,
  observeRunnerFailure,
  observeRunnerFailureWithSealFailure,
  observeTestRunnerFold,
  observeUnsupportedTypeExecution,
  streamingDescriptorYielding,
  unresolvedRunnerDescriptor,
} from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor compliance", () => {
  it("records scope, finding, and terminal evidence only through the verify recorder lifecycle", async () => {
    const observation = await observeExecutorRun({
      scopeUnits: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
      findings: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.finding())],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
    });

    expect(observation.result.executed).toBe(true);
    expect(observation.recorderCalls).toEqual({
      open: 1,
      scope: observation.outcome.scopeUnits.length,
      finding: observation.outcome.findings.length,
      finish: 1,
    });
    const events = observation.report?.events ?? [];
    const evidenceEvents = [
      ...eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE),
      ...eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING),
      ...eventsOfType(events, VERIFY_TERMINAL_EVENT_TYPE),
      ...eventsOfType(events, VERIFY_RUN_CONTEXT_EVENT_TYPE),
    ];
    expect(evidenceEvents.length).toBeGreaterThan(0);
    for (const event of evidenceEvents) expect(event.source).toBe(VERIFY_EVENT_SOURCE);
  });

  it("opens the run in spx drive mode so an unsealed run advertises no caller evidence-append action", async () => {
    const observation = await observeDriveModeAroundSeal({
      scopeUnits: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
      findings: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.finding())],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
    });

    expect(observation.unsealedDriveMode).toBe(VERIFY_DRIVE_MODE.SPX);
    expect(observation.unsealedNextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.SCOPE_ADD);
    expect(observation.unsealedNextActions).not.toContain(VERIFY_LIFECYCLE_ACTION.FINDING_ADD);
    expect(observation.unsealedNextActions).toContain(VERIFY_LIFECYCLE_ACTION.FINISH);
    expect(observation.sealedDriveMode).toBe(VERIFY_DRIVE_MODE.SPX);
  });

  it("reaches the test type's runner through the testing registry, naming no language", async () => {
    const observation = await observeRegistryResolution();

    expect(observation.testRunnerResolved).toBe(true);
    expect(observation.auditRunnerResolved).toBe(false);
    expect(observation.receivedUnits).toEqual([observation.streamedUnit]);
    expect(observation.invocation).toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED });

    // The production registry, not an injected one, is what the `test` type resolves: over a product
    // that declares TypeScript and installs no runner, the registry's own TypeScript language is the
    // one that reports the product directory it searched.
    const production = await observeProductionRegistryDrive();
    expect(production.invocation).toEqual({
      invoked: false,
      unresolvedRunner: { productDir: production.productDir },
    });
  });

  it("opens no run when the verification type resolves to no runner", async () => {
    const observation = await observeUnsupportedTypeExecution();

    expect(observation.result).toEqual({ executed: false });
    expect(observation.recorderCalls).toEqual({ open: 0, scope: 0, finding: 0, finish: 0 });
  });

  it("raises rather than swallows a non-OK recorder command for open, scope, finding, and finish", async () => {
    const thunks = await observeRecorderLifecycleFailures();

    await expect(thunks.openMalformedScope()).rejects.toThrow(RECORDER_OPERATION_ERROR.OPEN_FAILED);
    await expect(thunks.appendScopeToMissingRun()).rejects.toThrow(RECORDER_OPERATION_ERROR.SCOPE_FAILED);
    await expect(thunks.appendFindingToMissingRun()).rejects.toThrow(RECORDER_OPERATION_ERROR.FINDING_FAILED);
    await expect(thunks.finishMissingRun()).rejects.toThrow(RECORDER_OPERATION_ERROR.FINISH_FAILED);
  });

  it("folds a failing language to a failed run terminal status over passing and interrupted languages", async () => {
    await expect(observeTestRunnerFold([
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.PASSED),
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED),
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.FAILED),
    ])).resolves.toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED });
  });

  it("folds an interrupted language to an interrupted run terminal status when no language failed", async () => {
    await expect(observeTestRunnerFold([
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.PASSED),
      streamingDescriptorYielding(JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED),
    ])).resolves.toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED });
  });

  it("gates the run out when every registry language is non-streaming or gated out", async () => {
    await expect(observeTestRunnerFold([nonStreamingDescriptor(), gatedOutDescriptor()])).resolves.toEqual({
      invoked: false,
    });
  });

  it("reports the unresolved runner when a present language has none and no language streamed, and interrupts when another language streamed", async () => {
    const productDir = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).productDir;

    await expect(observeTestRunnerFold([gatedOutDescriptor(), unresolvedRunnerDescriptor(productDir)])).resolves
      .toEqual({ invoked: false, unresolvedRunner: { productDir } });
    for (const streamedStatus of Object.values(JOURNAL_RUN_TERMINAL_STATUS)) {
      await expect(observeTestRunnerFold([
        streamingDescriptorYielding(streamedStatus),
        unresolvedRunnerDescriptor(productDir),
      ])).resolves.toEqual({ invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED });
    }
  });

  it("seals an unresolved-runner outcome interrupted and names the product directory searched, unlike a gated-out run", async () => {
    const productDir = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.runRequest()).productDir;
    const observation = await observeExecutorRun({
      scopeUnits: [],
      findings: [],
      invocation: { invoked: false, unresolvedRunner: { productDir } },
    });

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.result.unresolvedRunner).toEqual({ productDir });
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.report?.sealed).toBe(true);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(0);
  });

  it("records two separator-straddling findings distinctly rather than collapsing them onto one key", async () => {
    const [first, second] = sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.collidingFindingPair());
    const observation = await observeExecutorRun({
      scopeUnits: [],
      findings: [first, second],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
    });

    expect(observation.result.executed).toBe(true);
    expect(first).not.toEqual(second);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(
      observation.outcome.findings.length,
    );
  });

  it("serializes overlapping runner appends so each reaches the recorder alone, in arrival order, and none is lost", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.distinctScopeUnits(),
      async (units) => {
        const observation = await observeOverlappingAppends(units);
        expect(observation.peakInFlight).toBe(1);
        expect(observation.received).toEqual(observation.fired);
        expect(observation.result.executed).toBe(true);
        expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.PASSED);
        expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(
          units.length,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("rejects only the append the recorder refused while the appends queued behind it still reach the recorder", async () => {
    await assertProperty(
      JOURNAL_REPORTER_TEST_GENERATOR.distinctScopeUnits(),
      async (units) => {
        const observation = await observeRejectedAppendAmongQueued(units);
        const [first, ...later] = observation.rejections;
        expect(first).toBe(observation.failure);
        for (const rejection of later) expect(rejection).toBeUndefined();
        expect(observation.received).toEqual(observation.fired.slice(1));
        expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(
          units.length - 1,
        );
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("finishes the opened run interrupted when the runner fails, before surfacing the failure", async () => {
    const observation = await observeRunnerFailure();

    expect(observation.rejection).toBe(observation.failure);
    expect(observation.opened).toBeDefined();
    expect(observation.report?.sealed).toBe(true);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
  });

  it("surfaces the runner failure rather than the finish failure when the best-effort seal also fails", async () => {
    const observation = await observeRunnerFailureWithSealFailure();

    expect(observation.rejection).toBe(observation.runnerFailure);
    expect(observation.rejection).not.toBe(observation.finishFailure);
  });
});
