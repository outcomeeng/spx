/**
 * Child-process registry. Tracks asynchronously spawned children so that
 * lifecycle handlers can reach them when the parent receives a termination
 * signal.
 *
 * The registry is identity-based: callers pass the `ChildHandle` reference
 * returned by `spawn` to both `add` and `remove`.
 *
 * @module lib/process-lifecycle/registry
 */

import type { ChildHandle, ChildRegistry } from "./types";

export function createRegistry(): ChildRegistry {
  const tracked = new Set<ChildHandle>();

  return {
    add(child: ChildHandle): void {
      tracked.add(child);
    },
    remove(child: ChildHandle): void {
      tracked.delete(child);
    },
    forEach(fn: (child: ChildHandle) => void): void {
      for (const child of tracked) fn(child);
    },
    get size(): number {
      return tracked.size;
    },
  };
}
