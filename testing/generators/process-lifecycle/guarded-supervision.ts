/**
 * Generators for the guarded supervision of `src/lib/process-lifecycle/`.
 *
 * The signal domain is the production `GUARDED_SIGNALS`, so a change to the signals the supervisor
 * forwards is an intentional behavior change the cases follow.
 */
import * as fc from "fast-check";

import { GUARDED_SIGNALS, type GuardedSupervisionRequest } from "@/lib/process-lifecycle";

const EXIT_CODE_COUNT = 256;
const MAX_CHILD_EXIT_CODE = 125;
const MIN_CHILD_PID = 2;
const MAX_CHILD_PID = 99_999;
const MIN_LISTENERS_PER_SIGNAL = 1;
const MAX_LISTENERS_PER_SIGNAL = 3;
const MIN_DESCRIPTOR = 4;
const MAX_DESCRIPTOR = 200;
const COMMAND_PATTERN = /^[a-z]{3,10}$/;
const ARGUMENT_PATTERN = /^[a-z]{1,8}$/;
const MAX_ARGUMENT_COUNT = 3;

/** Every status a child process can exit with: the complete 8-bit domain. */
export const EXIT_CODE_DOMAIN: readonly number[] = Array.from({ length: EXIT_CODE_COUNT }, (_, code) => code);

/** Exit codes a child chooses for itself, below the range a signal-ended child reports. */
export function arbitraryExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: MAX_CHILD_EXIT_CODE });
}

export function arbitraryChildPid(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_CHILD_PID, max: MAX_CHILD_PID });
}

/** One listener count per guarded signal, in `GUARDED_SIGNALS` order. */
export function arbitraryListenerCounts(): fc.Arbitrary<number[]> {
  return fc.array(fc.integer({ min: MIN_LISTENERS_PER_SIGNAL, max: MAX_LISTENERS_PER_SIGNAL }), {
    minLength: GUARDED_SIGNALS.length,
    maxLength: GUARDED_SIGNALS.length,
  });
}

export function arbitraryGuardedRequest(): fc.Arbitrary<GuardedSupervisionRequest> {
  return fc.record({
    command: fc.stringMatching(COMMAND_PATTERN),
    args: fc.array(fc.stringMatching(ARGUMENT_PATTERN), { maxLength: MAX_ARGUMENT_COUNT }),
    descriptor: fc.integer({ min: MIN_DESCRIPTOR, max: MAX_DESCRIPTOR }),
  });
}

/** The message of the error a child that cannot be started reports. */
export function arbitrarySpawnFailureMessage(): fc.Arbitrary<string> {
  return fc.string();
}
