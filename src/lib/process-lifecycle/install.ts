/**
 * CLI process-lifecycle installation. Wires real Node process events to the
 * lifecycle handlers and exposes the production `lifecycleProcessRunner`
 * that the validation steps consume.
 *
 * The module-scoped registry holds child handles; `installLifecycle()`
 * attaches handlers once. Calling `installLifecycle()` more than once is a
 * no-op so re-entry from accidental imports does not double-install.
 *
 * @module lib/process-lifecycle/install
 */

import { spawn } from "node:child_process";

import { createHandlers } from "./handlers";
import { createRegistry } from "./registry";
import { createLifecycleRunner } from "./runner";
import type { ChildRegistry, ExitController, LifecycleHandlers } from "./types";

const moduleRegistry: ChildRegistry = createRegistry();
const moduleExitController: ExitController = {
  exit(code: number): void {
    process.exit(code);
  },
};

let installed = false;

export const lifecycleProcessRunner = createLifecycleRunner({
  registry: moduleRegistry,
  spawn,
});

export const EPIPE_CODE = "EPIPE";
export const UNCAUGHT_EVENT_NAME = "uncaughtException";

export function installLifecycle(): void {
  if (installed) return;
  installed = true;

  const handlers: LifecycleHandlers = createHandlers({
    registry: moduleRegistry,
    exitController: moduleExitController,
  });

  process.on("uncaughtException", (error: unknown) => handlers.onUncaught(error));
  process.on("unhandledRejection", (reason: unknown) => handlers.onUncaught(reason));
  process.on("SIGTERM", () => handlers.onSigterm());
  process.on("SIGINT", () => handlers.onSigint());

  process.stdout.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === EPIPE_CODE) {
      handlers.onEpipe();
      return;
    }
    handlers.onUncaught(error);
  });
  process.stderr.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === EPIPE_CODE) {
      handlers.onEpipe();
      return;
    }
    handlers.onUncaught(error);
  });
}
