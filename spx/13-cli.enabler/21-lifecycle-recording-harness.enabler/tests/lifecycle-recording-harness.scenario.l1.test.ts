import { describe, expect, it } from "vitest";

import { LIFECYCLE_SUCCESS_EXIT_CODE } from "@testing/generators/process-lifecycle/lifecycle";
import { RECORDING_CHILD_EXIT_EVENT, RecordingChild } from "@testing/harnesses/process-lifecycle/lifecycle";

describe("Scenario: recording child exit listeners", () => {
  it("notifies the first and then the second exit listener with exit code 0, and makes no other call", () => {
    const child = new RecordingChild();
    const observedCalls: Array<readonly [listener: string, args: readonly unknown[]]> = [];

    child.on(RECORDING_CHILD_EXIT_EVENT, (...args: unknown[]) => {
      observedCalls.push(["first", args]);
    });
    child.on(RECORDING_CHILD_EXIT_EVENT, (...args: unknown[]) => {
      observedCalls.push(["second", args]);
    });

    child.triggerExit(LIFECYCLE_SUCCESS_EXIT_CODE);

    expect(observedCalls).toEqual([
      ["first", [LIFECYCLE_SUCCESS_EXIT_CODE]],
      ["second", [LIFECYCLE_SUCCESS_EXIT_CODE]],
    ]);
  });
});
