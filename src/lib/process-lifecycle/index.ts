/**
 * Process-lifecycle public surface for the SPX CLI boundary.
 *
 * Production callers import `installLifecycle` and `lifecycleProcessRunner`.
 * Tests import the factory functions (`createRegistry`, `createHandlers`,
 * `createLifecycleRunner`) plus the typed interfaces and exit-code constants.
 *
 * @module lib/process-lifecycle
 */

export { EPIPE_EXIT_CODE, SIGINT_EXIT_CODE, SIGTERM_EXIT_CODE, UNCAUGHT_EXIT_CODE } from "./exit-codes";
export {
  createSignalSuspender,
  FOREGROUND_SIGNALS,
  type SignalListener,
  type SignalSuspender,
  type SignalTarget,
} from "./foreground-handoff";
export { createHandlers, SIGINT_NAME, SIGTERM_NAME } from "./handlers";
export {
  EPIPE_CODE,
  foregroundProcessRunner,
  installLifecycle,
  lifecycleProcessRunner,
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
