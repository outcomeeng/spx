import { describe, it } from "vitest";

import {
  assertExecutorDrivesRunnerAndReportsLocator,
  assertExecutorRecordsFindingWithoutErrorMessages,
  assertExecutorRecordsScopeFindingAndTerminal,
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
});
