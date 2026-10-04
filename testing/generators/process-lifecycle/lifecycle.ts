/**
 * Input domains and exit-code oracle for the process-lifecycle evidence of `spx/13-cli.enabler`.
 *
 * The generators vary what the lifecycle contract quantifies over: interleavings of registry
 * operations, handler invocation counts, spawn requests, tracked-child sets, foreground listener
 * sets, the managed-subprocess payloads a child emits, and the validation-step process runners the
 * product exports. The exit-code oracle is declared from the POSIX convention and the spec's own
 * mapping rather than imported from the lifecycle module, so a regression in a production exit-code
 * constant cannot move the expectation with it.
 *
 * @module testing/generators/process-lifecycle/lifecycle
 */
import { constants as osConstants } from "node:os";

import * as fc from "fast-check";

import {
  EPIPE_CODE,
  FOREGROUND_SIGNALS,
  type LifecycleHandlers,
  type ProcessRunner,
  SIGINT_NAME,
  type SignalListener,
  SIGTERM_NAME,
  UNCAUGHT_EVENT_NAME,
} from "@/lib/process-lifecycle";
import * as validationSteps from "@/validation/steps";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";

const MAX_REGISTRY_CHILD_POOL_SIZE = 10;
const MAX_REGISTRY_OPERATION_COUNT = 50;
const MAX_HANDLER_INVOCATION_COUNT = 10;
const MAX_SPAWN_REQUEST_COUNT = 10;
const MAX_SPAWN_ARGUMENT_COUNT = 4;
const MIN_MULTIPLE_TRACKED_CHILD_COUNT = 2;
const MAX_TRACKED_CHILD_COUNT = 8;
const MIN_FOREGROUND_LISTENER_COUNT = 1;
const MAX_FOREGROUND_LISTENER_COUNT = 4;

/** POSIX reports a process terminated by a signal as `128 + signal number`. */
const POSIX_SIGNAL_EXIT_BASE = 128;
/** The spec maps a downstream-closed stdout to a successful exit, as `head` and `tee` treat it. */
const SPEC_EPIPE_EXIT_CODE = 0;
/** The spec maps an uncaught exception to the generic failure exit. */
const SPEC_UNCAUGHT_EXIT_CODE = 1;

/** One operation applied to the child registry, naming a child by its index in the pool. */
export type RegistryOperation =
  | { readonly kind: "add"; readonly childIndex: number }
  | { readonly kind: "remove"; readonly childIndex: number };

/** A pool of tracked children and an interleaved sequence of registry operations over it. */
export interface RegistryOperationScenario {
  readonly childPoolSize: number;
  readonly operations: readonly RegistryOperation[];
}

/** One `spawn` request a domain runner hands the lifecycle runner. */
export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
}

/** A command, its arguments, and the distinct stdout and stderr chunks its child emits. */
export interface ManagedSubprocessCase {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdoutChunk: string;
  readonly stderrChunk: string;
}

/** One lifecycle event, the handler call that delivers it, and the exit code the spec maps it to. */
export interface LifecycleExitCase {
  readonly event: string;
  readonly deliver: (handlers: LifecycleHandlers) => void;
  readonly expectedExit: number;
}

function posixSignalExitCode(signal: NodeJS.Signals): number {
  return POSIX_SIGNAL_EXIT_BASE + osConstants.signals[signal];
}

/**
 * The stdio value Node defines for a child whose streams the parent owns through pipes, declared
 * from Node's `child_process` contract rather than read from the managed-subprocess module.
 */
export const NODE_PARENT_PIPED_STDIO = "pipe";

/**
 * The exit code the spec maps each lifecycle event to, declared independently of the lifecycle
 * module's own constants: the termination signals by POSIX `128 + signal number`, a closed
 * downstream pipe to success, and an uncaught exception to the generic failure.
 */
export const LIFECYCLE_EXIT_ORACLE = {
  SIGINT: posixSignalExitCode(SIGINT_NAME),
  SIGTERM: posixSignalExitCode(SIGTERM_NAME),
  EPIPE: SPEC_EPIPE_EXIT_CODE,
  UNCAUGHT: SPEC_UNCAUGHT_EXIT_CODE,
} as const;

/** Interleaved add and remove operations over a generated pool of children. */
export function arbitraryRegistryOperationScenario(): fc.Arbitrary<RegistryOperationScenario> {
  return fc.integer({ min: 1, max: MAX_REGISTRY_CHILD_POOL_SIZE }).chain((childPoolSize) => {
    const childIndex = fc.integer({ min: 0, max: childPoolSize - 1 });
    const operation: fc.Arbitrary<RegistryOperation> = fc.oneof(
      fc.record({ kind: fc.constant("add" as const), childIndex }),
      fc.record({ kind: fc.constant("remove" as const), childIndex }),
    );
    return fc
      .array(operation, { maxLength: MAX_REGISTRY_OPERATION_COUNT })
      .map((operations) => ({ childPoolSize, operations }));
  });
}

/** How many times a lifecycle handler is invoked: at least once. */
export function arbitraryHandlerInvocationCount(): fc.Arbitrary<number> {
  return fc.integer({ min: 1, max: MAX_HANDLER_INVOCATION_COUNT });
}

/** A non-empty sequence of spawn requests. */
export function arbitrarySpawnRequests(): fc.Arbitrary<readonly SpawnRequest[]> {
  return fc.array(
    fc.record({
      command: arbitraryDomainLiteral(),
      args: fc.array(arbitraryDomainLiteral(), { maxLength: MAX_SPAWN_ARGUMENT_COUNT }),
    }),
    { minLength: 1, maxLength: MAX_SPAWN_REQUEST_COUNT },
  );
}

/** A count of tracked children for the "two or more" scenarios. */
export function arbitraryMultipleTrackedChildCount(): fc.Arbitrary<number> {
  return fc.integer({ min: MIN_MULTIPLE_TRACKED_CHILD_COUNT, max: MAX_TRACKED_CHILD_COUNT });
}

/** A distinct, non-empty listener list for every foreground signal. */
export function arbitraryForegroundSignalListeners(): fc.Arbitrary<ReadonlyMap<NodeJS.Signals, SignalListener[]>> {
  return fc
    .array(fc.integer({ min: MIN_FOREGROUND_LISTENER_COUNT, max: MAX_FOREGROUND_LISTENER_COUNT }), {
      minLength: FOREGROUND_SIGNALS.length,
      maxLength: FOREGROUND_SIGNALS.length,
    })
    .map((counts) =>
      new Map(
        FOREGROUND_SIGNALS.map((signal, index) => {
          const listeners: SignalListener[] = Array.from(
            { length: counts[index] ?? MIN_FOREGROUND_LISTENER_COUNT },
            () => () => {},
          );
          return [signal, listeners] as const;
        }),
      )
    );
}

/** A managed-subprocess invocation whose child emits distinct stdout and stderr chunks. */
export function arbitraryManagedSubprocessCase(): fc.Arbitrary<ManagedSubprocessCase> {
  return fc
    .record({
      command: arbitraryDomainLiteral(),
      args: fc.array(arbitraryDomainLiteral(), { minLength: 1, maxLength: MAX_SPAWN_ARGUMENT_COUNT }),
      stdoutChunk: arbitraryDomainLiteral(),
      stderrChunk: arbitraryDomainLiteral(),
    })
    .filter(({ stdoutChunk, stderrChunk }) => stdoutChunk !== stderrChunk);
}

/**
 * Every lifecycle event with the exit code the spec maps it to: the two termination signals by the
 * POSIX `128 + signal number` convention read from Node's signal table, a downstream-closed stdout
 * to success, and an uncaught exception to the generic failure.
 */
export function lifecycleExitCases(): readonly LifecycleExitCase[] {
  return [
    { event: SIGINT_NAME, deliver: (handlers) => handlers.onSigint(), expectedExit: LIFECYCLE_EXIT_ORACLE.SIGINT },
    {
      event: SIGTERM_NAME,
      deliver: (handlers) => handlers.onSigterm(),
      expectedExit: LIFECYCLE_EXIT_ORACLE.SIGTERM,
    },
    { event: EPIPE_CODE, deliver: (handlers) => handlers.onEpipe(), expectedExit: LIFECYCLE_EXIT_ORACLE.EPIPE },
    {
      event: UNCAUGHT_EVENT_NAME,
      deliver: (handlers) => handlers.onUncaught(new Error()),
      expectedExit: LIFECYCLE_EXIT_ORACLE.UNCAUGHT,
    },
  ];
}

function isProcessRunner(value: unknown): value is ProcessRunner {
  return typeof value === "object" && value !== null && "spawn" in value && typeof value.spawn === "function";
}

/** Every `ProcessRunner` the validation-steps module exports, keyed by its export name. */
export function validationStepProcessRunners(): ReadonlyArray<readonly [string, ProcessRunner]> {
  return Object.entries(validationSteps).flatMap(([name, value]) =>
    isProcessRunner(value) ? [[name, value] as const] : []
  );
}
