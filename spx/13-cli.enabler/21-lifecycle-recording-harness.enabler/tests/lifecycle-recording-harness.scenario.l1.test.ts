import { describe, expect, it } from "vitest";

import { EPIPE_EXIT_CODE, UNCAUGHT_EXIT_CODE } from "@/lib/process-lifecycle";
import { RECORDING_CHILD_EXIT_EVENT, RecordingChild } from "@testing/harnesses/process-lifecycle/lifecycle";

describe("Scenario: recording child exit listeners", () => {
  it("notifies every registered exit listener in registration order", () => {
    const child = new RecordingChild();
    const observedCalls: Array<readonly [listener: (code: number | null) => void, code: number]> = [];

    const firstListener = (code: number | null): void => {
      observedCalls.push([firstListener, code ?? UNCAUGHT_EXIT_CODE]);
    };
    const secondListener = (code: number | null): void => {
      observedCalls.push([secondListener, code ?? UNCAUGHT_EXIT_CODE]);
    };

    child.on(RECORDING_CHILD_EXIT_EVENT, firstListener);
    child.on(RECORDING_CHILD_EXIT_EVENT, secondListener);

    child.triggerExit(EPIPE_EXIT_CODE);

    expect(observedCalls).toEqual([
      [firstListener, EPIPE_EXIT_CODE],
      [secondListener, EPIPE_EXIT_CODE],
    ]);
  });
});
