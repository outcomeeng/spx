/**
 * Lifecycle-aware process runner. Wraps a real `spawn` function so that
 * every child handle returned by `runner.spawn(...)` is registered in the
 * lifecycle registry and removed when the child exits.
 *
 * @module lib/process-lifecycle/runner
 */

import type { ChildRegistry, ProcessRunner } from "./types";

export interface LifecycleRunnerDeps {
  readonly registry: ChildRegistry;
  readonly spawn: ProcessRunner["spawn"];
}

export type LifecycleSpawn = LifecycleRunnerDeps["spawn"];

export function createLifecycleRunner(deps: LifecycleRunnerDeps): ProcessRunner {
  return {
    spawn(command, args, options) {
      const child = deps.spawn(command, args, options);
      deps.registry.add(child);
      child.on("exit", () => deps.registry.remove(child));
      return child;
    },
  };
}
