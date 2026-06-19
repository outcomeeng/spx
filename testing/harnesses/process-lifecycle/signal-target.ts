/**
 * In-memory `SignalTarget` for the foreground-handoff signal suspender.
 *
 * Records the listener set per signal so the suspend / restore pairing verifies
 * over a recording target with no real signal delivery — production binds the
 * suspender to `process`. `listeners` returns a copy so a caller iterating the
 * originals is unaffected by the suspender's removals.
 *
 * @module process-lifecycle/testing/signal-target
 */

import type { SignalListener, SignalTarget } from "@/lib/process-lifecycle";

export class RecordingSignalTarget implements SignalTarget {
  private readonly registry = new Map<NodeJS.Signals, SignalListener[]>();

  constructor(initial: ReadonlyMap<NodeJS.Signals, readonly SignalListener[]> = new Map()) {
    for (const [signal, listeners] of initial) this.registry.set(signal, [...listeners]);
  }

  listeners(signal: NodeJS.Signals): SignalListener[] {
    return [...(this.registry.get(signal) ?? [])];
  }

  on(signal: NodeJS.Signals, listener: SignalListener): void {
    this.registry.set(signal, [...(this.registry.get(signal) ?? []), listener]);
  }

  removeListener(signal: NodeJS.Signals, listener: SignalListener): void {
    const current = this.registry.get(signal) ?? [];
    const index = current.indexOf(listener);
    if (index === -1) return;
    const next = [...current];
    next.splice(index, 1);
    this.registry.set(signal, next);
  }
}
