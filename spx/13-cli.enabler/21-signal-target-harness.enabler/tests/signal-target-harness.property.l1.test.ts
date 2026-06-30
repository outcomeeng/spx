import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { FOREGROUND_SIGNALS, type SignalListener } from "@/lib/process-lifecycle";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";

const listenerPoolSize = 3;

interface SignalOperation {
  readonly shouldAdd: boolean;
  readonly signal: NodeJS.Signals;
  readonly listenerIndex: number;
}

function signalOperation(): fc.Arbitrary<SignalOperation> {
  return fc.record({
    shouldAdd: fc.boolean(),
    signal: fc.constantFrom(...FOREGROUND_SIGNALS),
    listenerIndex: fc.integer({ min: 0, max: listenerPoolSize - 1 }),
  });
}

function currentListeners(
  model: ReadonlyMap<NodeJS.Signals, readonly SignalListener[]>,
  signal: NodeJS.Signals,
): readonly SignalListener[] {
  return model.get(signal) ?? [];
}

describe("Property: recording signal target listener registry", () => {
  it("appends listeners in order and removes only the first matching listener", () => {
    fc.assert(
      fc.property(fc.array(signalOperation()), (operations) => {
        const listenerPool = createListenerPool();
        const target = new RecordingSignalTarget();
        const model = new Map<NodeJS.Signals, SignalListener[]>();

        for (const operation of operations) {
          const listener = listenerPool[operation.listenerIndex];
          if (listener === undefined) continue;

          if (operation.shouldAdd) {
            target.on(operation.signal, listener);
            model.set(operation.signal, [...currentListeners(model, operation.signal), listener]);
          } else {
            target.removeListener(operation.signal, listener);
            const listeners = [...currentListeners(model, operation.signal)];
            const index = listeners.indexOf(listener);
            if (index !== -1) listeners.splice(index, 1);
            model.set(operation.signal, listeners);
          }
        }

        for (const signal of FOREGROUND_SIGNALS) {
          expect(target.listeners(signal)).toEqual(currentListeners(model, signal));
        }
      }),
    );
  });

  it("clones initial listener arrays at construction", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: listenerPoolSize - 1 })),
        fc.array(fc.integer({ min: 0, max: listenerPoolSize - 1 })),
        (sigintIndexes, sigtermIndexes) => {
          const listenerPool = createListenerPool();
          const sigintSignal = FOREGROUND_SIGNALS[0];
          const sigtermSignal = FOREGROUND_SIGNALS[1];
          const sigintListeners = sigintIndexes.map((index) => listenerPool[index]).filter(isListener);
          const sigtermListeners = sigtermIndexes.map((index) => listenerPool[index]).filter(isListener);
          const target = new RecordingSignalTarget(
            new Map([
              [sigintSignal, sigintListeners],
              [sigtermSignal, sigtermListeners],
            ]),
          );

          const firstListener = listenerPool[0];
          const secondListener = listenerPool[1];
          if (firstListener !== undefined) sigintListeners.push(firstListener);
          if (secondListener !== undefined) sigtermListeners.push(secondListener);

          expect(target.listeners(sigintSignal)).toEqual(
            sigintIndexes.map((index) => listenerPool[index]).filter(isListener),
          );
          expect(target.listeners(sigtermSignal)).toEqual(
            sigtermIndexes.map((index) => listenerPool[index]).filter(isListener),
          );
        },
      ),
    );
  });
});

function createListenerPool(): readonly SignalListener[] {
  return [
    () => undefined,
    () => undefined,
    () => undefined,
  ];
}

function isListener(listener: SignalListener | undefined): listener is SignalListener {
  return listener !== undefined;
}
