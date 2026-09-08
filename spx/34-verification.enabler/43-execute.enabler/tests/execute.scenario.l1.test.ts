import { describe, expect, it } from "vitest";

import { JOURNAL_RUN_STATE_STATUS } from "@/domains/journal/run-state";
import { VERIFY_APPEND_EVENT_TYPE, VERIFY_VERIFICATION_TYPE } from "@/domains/verify/verify";
import {
  eventsOfType,
  failingMixedOutcome,
  findingWithoutErrorMessagesOutcome,
  gatedOutOutcome,
  interruptedRunnerOutcome,
  observeExecutorRun,
  passingScopeOutcome,
} from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor scenarios", () => {
  it("drives the type's runner over the scope and reports the run locator", async () => {
    const observation = await observeExecutorRun(passingScopeOutcome());

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.PASSED);
    expect(observation.result.run.runToken.length).toBeGreaterThan(0);
    expect(observation.result.run.verificationType).toBe(VERIFY_VERIFICATION_TYPE.TEST);
    expect(observation.result.run.scopeIdentity).toBe(observation.request.scope);
    expect(observation.drivenRequest?.productDir).toBe(observation.request.productDir);
    expect(observation.drivenRequest?.testPaths).toEqual(observation.request.testPaths);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
  });

  it("records a passing unit as scope, a failing unit as a finding, and finishes with the derived terminal status", async () => {
    const observation = await observeExecutorRun(failingMixedOutcome());

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
    expect(observation.report?.sealed).toBe(true);
  });

  it("records a failing case whose errors carry no message", async () => {
    const observation = await observeExecutorRun(findingWithoutErrorMessagesOutcome());

    expect(observation.result.executed).toBe(true);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(1);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.FAILED);
  });

  it("finishes a gated-out run as interrupted, recording no scope or finding", async () => {
    const observation = await observeExecutorRun(gatedOutOutcome());

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.result.unresolvedRunner).toBeUndefined();
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(0);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.FINDING)).toHaveLength(0);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.report?.sealed).toBe(true);
  });

  it("maps an invoked runner's interrupted report to the interrupted recorder status", async () => {
    const observation = await observeExecutorRun(interruptedRunnerOutcome());

    expect(observation.result.executed).toBe(true);
    if (!observation.result.executed) return;
    expect(observation.result.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(eventsOfType(observation.report?.events ?? [], VERIFY_APPEND_EVENT_TYPE.SCOPE)).toHaveLength(1);
    expect(observation.report?.terminalStatus).toBe(JOURNAL_RUN_STATE_STATUS.INTERRUPTED);
    expect(observation.report?.sealed).toBe(true);
  });
});
