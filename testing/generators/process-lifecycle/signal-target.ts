import * as fc from "fast-check";

import { SIGINT_NAME, type SignalListener, SIGTERM_NAME } from "@/lib/process-lifecycle";

/** The number of listeners in the pool every signal-target case draws from. */
export const SIGNAL_TARGET_LISTENER_POOL_SIZE = 3;

/** The signals every signal-target case registers listeners for: `SIGINT` and `SIGTERM`. */
export const SIGNAL_TARGET_SIGNALS: readonly NodeJS.Signals[] = [SIGINT_NAME, SIGTERM_NAME];

/** One add or remove of the pool listener at `listenerIndex` for `signal`. */
export interface SignalOperation {
  readonly shouldAdd: boolean;
  readonly signal: NodeJS.Signals;
  readonly listenerIndex: number;
}

/** Pool listener indexes per signal, from which a case builds the initial listener map of a signal target. */
export type InitialListenerIndexes = ReadonlyMap<NodeJS.Signals, readonly number[]>;

/** A fresh pool of distinct listeners, so each case compares listeners by identity. */
export function createSignalListenerPool(): readonly SignalListener[] {
  return Array.from({ length: SIGNAL_TARGET_LISTENER_POOL_SIZE }, () => () => undefined);
}

function arbitraryListenerIndex(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: SIGNAL_TARGET_LISTENER_POOL_SIZE - 1 });
}

/** A sequence of add and remove operations over `SIGINT` and `SIGTERM`, the empty sequence included. */
export function arbitrarySignalOperationSequence(): fc.Arbitrary<SignalOperation[]> {
  return fc.array(
    fc.record({
      shouldAdd: fc.boolean(),
      signal: fc.constantFrom(...SIGNAL_TARGET_SIGNALS),
      listenerIndex: arbitraryListenerIndex(),
    }),
  );
}

/** A list of pool listener indexes, the empty list included, for each of `SIGINT` and `SIGTERM`. */
export function arbitraryInitialListenerIndexes(): fc.Arbitrary<InitialListenerIndexes> {
  return fc
    .tuple(...SIGNAL_TARGET_SIGNALS.map(() => fc.array(arbitraryListenerIndex())))
    .map((indexLists) =>
      new Map(SIGNAL_TARGET_SIGNALS.map((signal, position) => [signal, indexLists[position] ?? []]))
    );
}
