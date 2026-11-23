import * as fc from "fast-check";

import {
  EPIPE_EXIT_CODE,
  SIGINT_EXIT_CODE,
  SIGINT_NAME,
  SIGTERM_EXIT_CODE,
  SIGTERM_NAME,
  UNCAUGHT_EXIT_CODE,
} from "@/lib/process-lifecycle";

/** A kill value a recording child accepts: a signal name or an exit code. */
export type LifecycleKillValue = NodeJS.Signals | number;

/** The exit codes the process-lifecycle module produces: 0, 1, 130, and 143. */
export const LIFECYCLE_EXIT_CODES: readonly number[] = [
  EPIPE_EXIT_CODE,
  UNCAUGHT_EXIT_CODE,
  SIGINT_EXIT_CODE,
  SIGTERM_EXIT_CODE,
];

/** The signal names the process-lifecycle module forwards: `SIGINT` and `SIGTERM`. */
export const LIFECYCLE_SIGNAL_NAMES: readonly NodeJS.Signals[] = [SIGINT_NAME, SIGTERM_NAME];

/** Exit code 0, the code a successful lifecycle exit reports. */
export const LIFECYCLE_SUCCESS_EXIT_CODE = EPIPE_EXIT_CODE;

/** One exit code drawn from 0, 1, 130, and 143. */
export function arbitraryLifecycleExitCode(): fc.Arbitrary<number> {
  return fc.constantFrom(...LIFECYCLE_EXIT_CODES);
}

/** One kill value drawn from `SIGINT`, `SIGTERM`, and the exit codes 0, 1, 130, and 143. */
export function arbitraryLifecycleKillValue(): fc.Arbitrary<LifecycleKillValue> {
  return fc.constantFrom<LifecycleKillValue>(...LIFECYCLE_SIGNAL_NAMES, ...LIFECYCLE_EXIT_CODES);
}

/** A non-empty sequence of kill values. */
export function arbitraryLifecycleKillSequence(): fc.Arbitrary<LifecycleKillValue[]> {
  return fc.array(arbitraryLifecycleKillValue(), { minLength: 1 });
}

/** A sequence of exit codes, the empty sequence included. */
export function arbitraryLifecycleExitSequence(): fc.Arbitrary<number[]> {
  return fc.array(arbitraryLifecycleExitCode());
}
