import { describe, it } from "vitest";

import {
  assertExecutorDrivesRunnerAndReportsLocator,
  assertExecutorMapsInterruptedRunnerReport,
  assertExecutorRecordsFindingWithoutErrorMessages,
  assertExecutorRecordsScopeFindingAndTerminal,
  assertExecutorSealsGatedOutRunAsInterrupted,
} from "@testing/harnesses/verification-exec/harness";

describe("spx-driven verification executor scenarios", () => {
  it("drives the type's runner over the scope and reports the run locator", async () => {
    await assertExecutorDrivesRunnerAndReportsLocator();
  });

  it("records a passing unit as scope, a failing unit as a finding, and finishes with the derived terminal status", async () => {
    await assertExecutorRecordsScopeFindingAndTerminal();
  });

  it("records a failing case whose errors carry no message", async () => {
    await assertExecutorRecordsFindingWithoutErrorMessages();
  });

  it("finishes a gated-out run as interrupted, recording no scope or finding", async () => {
    await assertExecutorSealsGatedOutRunAsInterrupted();
  });

  it("maps an invoked runner's interrupted report to the interrupted recorder status", async () => {
    await assertExecutorMapsInterruptedRunnerReport();
  });
});
