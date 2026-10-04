import { describe, expect, it } from "vitest";

import { createHandlers, createRegistry, lifecycleProcessRunner } from "@/lib/process-lifecycle";
import { lifecycleExitCases, validationStepProcessRunners } from "@testing/generators/process-lifecycle/lifecycle";
import { RecordingExitController } from "@testing/harnesses/process-lifecycle/lifecycle";

describe("Mapping: lifecycle event to exit code", () => {
  it.each(lifecycleExitCases())("$event maps to exit code $expectedExit", ({ deliver, expectedExit }) => {
    const exitController = new RecordingExitController();
    const handlers = createHandlers({ registry: createRegistry(), exitController });

    deliver(handlers);

    expect(exitController.exits).toEqual([expectedExit]);
  });
});

describe("Mapping: validation-step ProcessRunner defaults", () => {
  it("the validation-steps module exports at least one ProcessRunner default", () => {
    expect(validationStepProcessRunners().length).toBeGreaterThan(0);
  });

  it.each(validationStepProcessRunners())("%s maps to the shared lifecycle runner", (_name, runner) => {
    expect(runner).toBe(lifecycleProcessRunner);
  });
});
