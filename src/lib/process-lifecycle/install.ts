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

import {
  createSignalSuspender,
  type SignalListener,
  type SignalSuspender,
  type SignalTarget,
} from "./foreground-handoff";
import { createHandlers } from "./handlers";
import { createRegistry } from "./registry";
import { createLifecycleRunner } from "./runner";
import type { ChildRegistry, ExitController, LifecycleHandlers, ProcessRunner } from "./types";

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

/**
 * Non-registering runner for the foreground exec-handoff: spawns the
 * terminal-owning child directly, without adding it to `moduleRegistry`, so the
 * lifecycle signal cleanup never touches a child the operator drives.
 */
export const foregroundProcessRunner: ProcessRunner = { spawn };

/** `process` as a `SignalTarget` — the parent's real signal listener set. */
const processSignalTarget: SignalTarget = {
  listeners: (signal) => process.listeners(signal) as SignalListener[],
  on: (signal, listener) => {
    process.on(signal, listener);
  },
  removeListener: (signal, listener) => {
    process.removeListener(signal, listener);
  },
};

/** Production signal suspender: ignores the foreground signals on `process` during a handoff. */
export const lifecycleSignalSuspender: SignalSuspender = createSignalSuspender(processSignalTarget);

export const EPIPE_CODE = "EPIPE";
export const UNCAUGHT_EVENT_NAME = "uncaughtException";
const UNCAUGHT_PREFIX = "Uncaught: ";
const NEWLINE = "\n";

function formatUncaught(error: unknown): string {
  if (error instanceof Error && error.stack !== undefined) {
    return UNCAUGHT_PREFIX + error.stack + NEWLINE;
  }
  return UNCAUGHT_PREFIX + String(error) + NEWLINE;
}

function logUncaughtToStderr(error: unknown): void {
  // Best-effort diagnostic write before the process exits. If stderr is
  // already closed, the write throws synchronously and we swallow it; the
  // exit path runs regardless so the operator at minimum sees a non-zero
  // exit code.
  try {
    process.stderr.write(formatUncaught(error));
  } catch {
    /* stderr unavailable; rely on exit code */
  }
}

export function installLifecycle(): void {
  if (installed) return;
  installed = true;

  const handlers: LifecycleHandlers = createHandlers({
    registry: moduleRegistry,
    exitController: moduleExitController,
  });

  process.on("uncaughtException", (error: unknown) => {
    logUncaughtToStderr(error);
    handlers.onUncaught(error);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    logUncaughtToStderr(reason);
    handlers.onUncaught(reason);
  });
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
