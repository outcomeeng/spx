/**
 * Process-lifecycle public surface for the SPX CLI boundary.
 *
 * Production callers import `installLifecycle` and `lifecycleProcessRunner`.
 * Tests import the factory functions (`createRegistry`, `createHandlers`,
 * `createLifecycleRunner`) plus the typed interfaces and exit-code constants.
 *
 * @module lib/process-lifecycle
 */

export {
  EPIPE_EXIT_CODE,
  SIGINT_EXIT_CODE,
  SIGNAL_EXIT_CODE_BASE,
  SIGTERM_EXIT_CODE,
  UNCAUGHT_EXIT_CODE,
  UNKNOWN_CHILD_EXIT_CODE,
} from "./exit-codes";
export {
  createSignalSuspender,
  FOREGROUND_SIGNALS,
  type SignalListener,
  type SignalSuspender,
  type SignalTarget,
} from "./foreground-handoff";
export {
  createGuardedSupervisor,
  GUARDED_DESCRIPTOR_NUMBER,
  GUARDED_SIGNALS,
  type GuardedChild,
  type GuardedExitListener,
  guardedExitStatus,
  type GuardedSpawn,
  type GuardedSupervisionDeps,
  type GuardedSupervisionRequest,
  type GuardedSupervisor,
  INHERITED_STDIO,
} from "./guarded-supervision";
export { createHandlers, SIGINT_NAME, SIGTERM_NAME } from "./handlers";
export {
  EPIPE_CODE,
  foregroundProcessRunner,
  guardedSupervisor,
  installLifecycle,
  lifecycleProcessRunner,
  lifecycleRegistry,
  lifecycleSignalSuspender,
  UNCAUGHT_EVENT_NAME,
} from "./install";
export {
  MANAGED_SUBPROCESS_STDIO,
  type ManagedSubprocessSpawnOptions,
  spawnManagedSubprocess,
} from "./managed-subprocess";
export { createRegistry } from "./registry";
export { createLifecycleRunner, type LifecycleRunnerDeps, type LifecycleSpawn } from "./runner";
export type {
  ChildHandle,
  ChildRegistry,
  ExitController,
  LifecycleHandlerDeps,
  LifecycleHandlers,
  ProcessRunner,
} from "./types";
