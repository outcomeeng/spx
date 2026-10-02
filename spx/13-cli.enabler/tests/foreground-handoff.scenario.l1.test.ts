/**
 * Foreground-handoff signal-suspender scenarios.
 *
 * Drives `createSignalSuspender` over a recording signal target. The listener
 * count per foreground signal is generated; every expectation is derived from
 * the generated listener set. No real process signals are touched.
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createSignalSuspender, FOREGROUND_SIGNALS, type SignalListener } from "@/lib/process-lifecycle";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";

/** Draw a single value from an arbitrary for an example-based scenario. */
function sample<T>(arbitrary: fc.Arbitrary<T>): T {
  return fc.sample(arbitrary, 1)[0];
}

/** A distinct, generated listener set for every foreground signal. */
function generatedListeners(): Map<NodeJS.Signals, SignalListener[]> {
  return new Map(
    FOREGROUND_SIGNALS.map((signal) => {
      const count = sample(fc.integer({ min: 1, max: 4 }));
      const listeners: SignalListener[] = Array.from({ length: count }, () => () => {});
      return [signal, listeners] as const;
    }),
  );
}

describe("foreground-handoff signal suspender", () => {
  it("replaces each foreground signal's listeners with one ignore listener and reinstates them on restore", () => {
    const originals = generatedListeners();
    const target = new RecordingSignalTarget(originals);

    const restore = createSignalSuspender(target).suspend();

    for (const signal of FOREGROUND_SIGNALS) {
      const suspended = target.listeners(signal);
      expect(suspended).toHaveLength(1);
      for (const original of originals.get(signal) ?? []) {
        expect(suspended).not.toContain(original);
      }
    }

    restore();

    for (const signal of FOREGROUND_SIGNALS) {
      expect(target.listeners(signal)).toEqual(originals.get(signal));
    }
  });
});
