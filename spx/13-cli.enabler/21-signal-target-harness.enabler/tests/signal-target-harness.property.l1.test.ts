import { describe, expect, it } from "vitest";

import type { SignalListener } from "@/lib/process-lifecycle";
import {
  arbitraryInitialListenerIndexes,
  arbitrarySignalOperationSequence,
  createSignalListenerPool,
  SIGNAL_TARGET_SIGNALS,
} from "@testing/generators/process-lifecycle/signal-target";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

function poolListener(pool: readonly SignalListener[], index: number): SignalListener {
  const listener = pool[index];
  if (listener === undefined) throw new RangeError(`listener pool holds no listener at ${index}`);
  return listener;
}

function modelListeners(
  model: ReadonlyMap<NodeJS.Signals, readonly SignalListener[]>,
  signal: NodeJS.Signals,
): readonly SignalListener[] {
  return model.get(signal) ?? [];
}

describe("Property: recording signal target listener registry", () => {
  it("appends listeners in order and removes only the first matching listener of a signal", () => {
    assertProperty(
      arbitrarySignalOperationSequence(),
      (operations) => {
        const pool = createSignalListenerPool();
        const target = new RecordingSignalTarget();
        const model = new Map<NodeJS.Signals, SignalListener[]>();

        for (const operation of operations) {
          const listener = poolListener(pool, operation.listenerIndex);
          const listeners = [...modelListeners(model, operation.signal)];

          if (operation.shouldAdd) {
            target.on(operation.signal, listener);
            listeners.push(listener);
          } else {
            target.removeListener(operation.signal, listener);
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
          }
          model.set(operation.signal, listeners);
        }

        for (const signal of SIGNAL_TARGET_SIGNALS) {
          expect(target.listeners(signal)).toEqual(modelListeners(model, signal));
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });

  it("copies each initial listener list at construction", () => {
    assertProperty(
      arbitraryInitialListenerIndexes(),
      (initialIndexes) => {
        const pool = createSignalListenerPool();
        const originals = new Map(
          [...initialIndexes].map(([signal, indexes]) => [signal, indexes.map((index) => poolListener(pool, index))]),
        );
        const expected = new Map([...originals].map(([signal, listeners]) => [signal, [...listeners]]));
        const target = new RecordingSignalTarget(originals);

        for (const listeners of originals.values()) listeners.push(poolListener(pool, 0));

        for (const signal of SIGNAL_TARGET_SIGNALS) {
          expect(target.listeners(signal)).toEqual(expected.get(signal));
        }
      },
      { level: PROPERTY_LEVEL.L1 },
    );
  });
});
