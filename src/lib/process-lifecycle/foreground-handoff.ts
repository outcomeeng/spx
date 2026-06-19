/**
 * Foreground exec-handoff support for the process-lifecycle module.
 *
 * A foreground exec-handoff spawns a terminal-owning child the operator drives
 * directly, then exits with the child's status. Unlike the managed subprocess
 * helper (piped, drained) and the lifecycle runner (registered for
 * kill-on-signal), the handoff child is neither piped nor tracked: it spawns
 * with inherited stdio and stays out of the registry, and the parent ignores
 * SIGINT and SIGTERM for the child's lifetime so the foreground child receives
 * them directly rather than being killed through the parent's cleanup or
 * having the exit-with-the-child's-status preempted.
 *
 * The signal suspender is built over an injected `SignalTarget` so the
 * suspend/restore pairing verifies against a recording target with no real
 * process signals; production binds the target to `process` in `install.ts`.
 *
 * @module lib/process-lifecycle/foreground-handoff
 */

/** Signals the parent ignores while a foreground child owns the terminal. */
export const FOREGROUND_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

/** A signal listener as the suspender moves it between the target and an ignore. */
export type SignalListener = (...args: unknown[]) => void;

/**
 * The subset of `process` the suspender toggles — injected so the suspend and
 * restore steps verify over a recording target with no real signal delivery.
 */
export interface SignalTarget {
  listeners(signal: NodeJS.Signals): SignalListener[];
  on(signal: NodeJS.Signals, listener: SignalListener): void;
  removeListener(signal: NodeJS.Signals, listener: SignalListener): void;
}

/** Suspends the parent's handling of the foreground signals for a handoff. */
export interface SignalSuspender {
  /**
   * Replace every foreground-signal listener with a single ignore listener, so
   * the parent keeps running while the child owns the terminal. Returns a
   * restore thunk that removes the ignore listener and reinstates the
   * originals.
   */
  suspend(): () => void;
}

/** Builds a signal suspender over `target` — `process` in production, a double in tests. */
export function createSignalSuspender(target: SignalTarget): SignalSuspender {
  return {
    suspend() {
      const ignore: SignalListener = () => {};
      const restorers = FOREGROUND_SIGNALS.map((signal) => {
        const originals = target.listeners(signal);
        for (const listener of originals) target.removeListener(signal, listener);
        target.on(signal, ignore);
        return () => {
          target.removeListener(signal, ignore);
          for (const listener of originals) target.on(signal, listener);
        };
      });
      return () => {
        for (const restore of restorers) restore();
      };
    },
  };
}
