import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_APPEND_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import { JOURNAL_RUN_TERMINAL_STATUS } from "@/test/languages/types";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { JOURNAL_REPORTER_TEST_GENERATOR } from "@testing/generators/testing/journal-reporter";
import {
  type ControlledRunOutcome,
  eventsOfType,
  observeExecutorRun,
} from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor scenarios", () => {
  it("drives the type's runner over the scope and reports the run locator", async () => {
    const outcome: ControlledRunOutcome = {
      scopeUnits: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
      findings: [],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.PASSED },
    };
    const observation = await observeExecutorRun(outcome);

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.PASSED);
    expect(observation.result.run.runToken.length).toBeGreaterThan(0);
    expect(observation.result.run.verificationType).toBe(VERIFY_VERIFICATION_TYPE.TEST);
    expect(observation.result.run.scopeIdentity).toBe(observation.request.scope);
    expect(observation.drivenRequest?.productDir).toBe(observation.request.productDir);
    expect(observation.drivenRequest?.testPaths).toEqual(observation.request.testPaths);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(
      outcome.scopeUnits.length,
    );
  });

  it("records a passing unit as scope, a failing unit as a finding, and finishes with the derived terminal status", async () => {
    const outcome: ControlledRunOutcome = {
      scopeUnits: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
      findings: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.finding())],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
    };
    const observation = await observeExecutorRun(outcome);

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
    const events = observation.report?.events ?? [];
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(outcome.scopeUnits.length);
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(outcome.findings.length);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
    expect(observation.report?.sealed).toBe(true);
  });

  it("records a failing case whose errors carry no message", async () => {
    const outcome: ControlledRunOutcome = {
      scopeUnits: [],
      findings: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.findingWithoutErrorMessages())],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.FAILED },
    };
    const observation = await observeExecutorRun(outcome);

    expect(observation.result.executed).toBe(true);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(
      outcome.findings.length,
    );
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
  });

  it("finishes a gated-out run as interrupted, recording no scope or finding", async () => {
    const observation = await observeExecutorRun({ scopeUnits: [], findings: [], invocation: { invoked: false } });

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.result.unresolvedRunner).toBeUndefined();
    const events = observation.report?.events ?? [];
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(0);
    expect(eventsOfType(events, VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.report?.sealed).toBe(true);
  });

  it("maps an invoked runner's interrupted report to the interrupted recorder status", async () => {
    const outcome: ControlledRunOutcome = {
      scopeUnits: [sampleGeneratedValue(JOURNAL_REPORTER_TEST_GENERATOR.scopeUnit())],
      findings: [],
      invocation: { invoked: true, terminalStatus: JOURNAL_RUN_TERMINAL_STATUS.INTERRUPTED },
    };
    const observation = await observeExecutorRun(outcome);

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(
      outcome.scopeUnits.length,
    );
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.report?.sealed).toBe(true);
  });
});
