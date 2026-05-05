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
export { createHandlers, SIGINT_NAME, SIGTERM_NAME } from "./handlers";
export { EPIPE_CODE, installLifecycle, lifecycleProcessRunner, UNCAUGHT_EVENT_NAME } from "./install";
export { createRegistry } from "./registry";
export { createLifecycleRunner } from "./runner";
export type { ChildHandle, ChildRegistry, ExitController, LifecycleHandlerDeps, LifecycleHandlers } from "./types";
