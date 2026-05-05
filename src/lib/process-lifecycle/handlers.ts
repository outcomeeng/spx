/**
 * Lifecycle handler factory. Produces the four handler entry points that
 * fire on SIGINT, SIGTERM, EPIPE, and uncaught exceptions.
 *
 * Each handler is idempotent: a `cleanupOnce` flag plus per-child
 * `child.killed` checks ensure that repeated invocations kill each
 * registered child exactly once. This handles the race in which SIGINT
 * arrives mid-write to a closed pipe.
 *
 * @module lib/process-lifecycle/handlers
 */

import { EPIPE_EXIT_CODE, SIGINT_EXIT_CODE, SIGTERM_EXIT_CODE, UNCAUGHT_EXIT_CODE } from "./exit-codes";
import type { ChildHandle, LifecycleHandlerDeps, LifecycleHandlers } from "./types";

export const SIGINT_NAME: NodeJS.Signals = "SIGINT";
export const SIGTERM_NAME: NodeJS.Signals = "SIGTERM";

export function createHandlers(deps: LifecycleHandlerDeps): LifecycleHandlers {
  let cleanupOnce = false;

  function killEachChild(signal: NodeJS.Signals): void {
    deps.registry.forEach((child: ChildHandle) => {
      if (!child.killed) child.kill(signal);
    });
  }

  function exitOnce(code: number, killSignal?: NodeJS.Signals): void {
    if (cleanupOnce) {
      deps.exitController.exit(code);
      return;
    }
    cleanupOnce = true;
    if (killSignal !== undefined) killEachChild(killSignal);
    deps.exitController.exit(code);
  }

  return {
    onSigint(): void {
      exitOnce(SIGINT_EXIT_CODE, SIGINT_NAME);
    },
    onSigterm(): void {
      exitOnce(SIGTERM_EXIT_CODE, SIGTERM_NAME);
    },
    onEpipe(): void {
      exitOnce(EPIPE_EXIT_CODE, SIGTERM_NAME);
    },
    onUncaught(_error: unknown): void {
      exitOnce(UNCAUGHT_EXIT_CODE, SIGTERM_NAME);
    },
  };
}
