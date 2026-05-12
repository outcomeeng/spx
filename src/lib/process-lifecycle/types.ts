/**
 * Public types for the process-lifecycle module.
 *
 * `ChildHandle` is a structural subset of Node's `ChildProcess`: every real
 * child process satisfies it, and tests can implement it with controlled
 * recording doubles. The interface includes only the operations the lifecycle
 * registry and handlers actually depend on.
 *
 * @module lib/process-lifecycle/types
 */

import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface ChildHandle {
  readonly pid?: number;
  readonly killed: boolean;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface ChildRegistry {
  add(child: ChildHandle): void;
  remove(child: ChildHandle): void;
  forEach(fn: (child: ChildHandle) => void): void;
  readonly size: number;
}

export interface ExitController {
  exit(code: number): void;
}

export interface LifecycleHandlers {
  onSigint(): void;
  onSigterm(): void;
  onEpipe(): void;
  onUncaught(error: unknown): void;
}

export interface LifecycleHandlerDeps {
  readonly registry: ChildRegistry;
  readonly exitController: ExitController;
}

/**
 * Injectable process boundary for domains that launch child processes.
 *
 * Production callers use the lifecycle runner so asynchronously spawned child
 * handles are registered for signal and EPIPE cleanup. Tests provide recording
 * runners instead of replacing Node's spawn primitive.
 */
export interface ProcessRunner {
  spawn(command: string, args: readonly string[], options?: SpawnOptions): ChildProcess;
}
