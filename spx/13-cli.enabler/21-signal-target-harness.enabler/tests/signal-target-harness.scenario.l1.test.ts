import { describe, expect, it } from "vitest";

import { SIGINT_NAME, type SignalListener, SIGTERM_NAME } from "@/lib/process-lifecycle";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";

const firstListener: SignalListener = () => undefined;
const secondListener: SignalListener = () => undefined;

describe("Scenario: recording signal target listener isolation", () => {
  it("returns listener copies so caller mutation cannot change the stored listener set", () => {
    const initialListeners = [firstListener];
    const target = new RecordingSignalTarget(new Map([[SIGINT_NAME, initialListeners]]));

    const returnedListeners = target.listeners(SIGINT_NAME);
    returnedListeners.push(secondListener);

    expect(target.listeners(SIGINT_NAME)).toEqual([firstListener]);
    expect(target.listeners(SIGTERM_NAME)).toEqual([]);
  });
});
