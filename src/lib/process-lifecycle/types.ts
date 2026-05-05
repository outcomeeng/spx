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
