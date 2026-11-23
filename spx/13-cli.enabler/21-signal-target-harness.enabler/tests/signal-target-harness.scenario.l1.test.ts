import { describe, expect, it } from "vitest";

import { SIGINT_NAME, SIGTERM_NAME } from "@/lib/process-lifecycle";
import { createSignalListenerPool } from "@testing/generators/process-lifecycle/signal-target";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";

describe("Scenario: recording signal target listener isolation", () => {
  it("keeps its SIGINT listeners when a caller appends to the returned array, and holds no SIGTERM listener", () => {
    const [firstListener, secondListener] = createSignalListenerPool();
    if (firstListener === undefined || secondListener === undefined) throw new RangeError("listener pool too small");
    const target = new RecordingSignalTarget(new Map([[SIGINT_NAME, [firstListener]]]));

    target.listeners(SIGINT_NAME).push(secondListener);

    expect(target.listeners(SIGINT_NAME)).toEqual([firstListener]);
    expect(target.listeners(SIGTERM_NAME)).toEqual([]);
  });
});
