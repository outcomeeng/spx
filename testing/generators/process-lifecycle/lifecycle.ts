/**
 * Generators and the exit-code oracle for process-lifecycle evidence.
 *
 * The generators own every variable input the lifecycle tests draw: tracked-child
 * counts, registry operation sequences, handler invocation counts, spawn requests,
 * foreground listener sets, and managed-subprocess output cases. The exit-code
 * oracle states the conventional codes from their own sources — POSIX `128 +
 * signal number` over Node's signal table, success for a downstream-closed pipe
 * (as `head` and `tee` exit), and the generic failure status for an internal
 * fault — rather than importing the production exit-code constants it judges.
 *
 * @module testing/generators/process-lifecycle/lifecycle
 */

import { constants as osConstants } from "node:os";
import { dirname } from "node:path";

import * as fc from "fast-check";

import { FOREGROUND_SIGNALS, type SignalListener } from "@/lib/process-lifecycle";
import { arbitraryDomainLiteral, arbitrarySourceFilePath } from "@testing/generators/literal/literal";

const POSIX_SIGNAL_EXIT_BASE = 128;
const SUCCESS_EXIT_STATUS = 0;
const GENERIC_FAILURE_EXIT_STATUS = 1;

const MIN_MULTIPLE_CHILDREN = 2;
const MAX_TRACKED_CHILDREN = 8;
const MAX_CHILD_POOL_SIZE = 10;
const MAX_REGISTRY_OPERATIONS = 50;
const MAX_HANDLER_INVOCATIONS = 10;
const MAX_SPAWN_REQUESTS = 10;
const MAX_SPAWN_ARGUMENTS = 3;
const MAX_LISTENERS_PER_SIGNAL = 4;

/** Exit codes a lifecycle path must produce, derived independently of the production constants. */
export const LIFECYCLE_EXIT_ORACLE = {
  /** A signal-terminated process exits with 128 plus the signal's number in Node's signal table. */
  signalExitCode: (signal: NodeJS.Signals): number => POSIX_SIGNAL_EXIT_BASE + osConstants.signals[signal],
  /** The status a process reports when it ends without failure. */
  SUCCESS: SUCCESS_EXIT_STATUS,
  /** A downstream-closed pipe ends the process successfully, as `head` and `tee` do. */
  DOWNSTREAM_CLOSED_PIPE: SUCCESS_EXIT_STATUS,
  /** An internal fault ends the process with the generic failure status. */
  INTERNAL_FAILURE: GENERIC_FAILURE_EXIT_STATUS,
} as const;

/** The two registry operations a conservation sequence interleaves. */
export const REGISTRY_OPERATION = {
  ADD: "add",
  REMOVE: "remove",
} as const;

export type RegistryOperationKind = (typeof REGISTRY_OPERATION)[keyof typeof REGISTRY_OPERATION];

export interface RegistryOperation {
  readonly kind: RegistryOperationKind;
  readonly index: number;
}

/** A pool of children and an interleaved add/remove sequence addressing members of that pool. */
export interface RegistryOperationSequence {
  readonly poolSize: number;
  readonly operations: readonly RegistryOperation[];
}

export interface SpawnRequest {
  readonly command: string;
  readonly args: readonly string[];
}

/** One managed-subprocess run: what is launched and the distinct bytes its two streams carry. */
export interface ManagedSubprocessCase {
  readonly command: string;
  readonly args: readonly string[];
  readonly stdoutChunk: string;
  readonly stderrChunk: string;
  readonly productDir: string;
}

/** A tracked-child count of two or more, the plural case a multi-child scenario states. */
export const arbitraryTrackedChildCount = (): fc.Arbitrary<number> =>
  fc.integer({ min: MIN_MULTIPLE_CHILDREN, max: MAX_TRACKED_CHILDREN });

/** How many times a handler fires; at least once. */
export const arbitraryHandlerInvocationCount = (): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: MAX_HANDLER_INVOCATIONS });

/** An interleaved add/remove sequence over a pool of children, each operation addressing a pool member. */
export const arbitraryRegistryOperationSequence = (): fc.Arbitrary<RegistryOperationSequence> =>
  fc.integer({ min: 1, max: MAX_CHILD_POOL_SIZE }).chain((poolSize) =>
    fc.record({
      poolSize: fc.constant(poolSize),
      operations: fc.array(
        fc.record({
          kind: fc.constantFrom(REGISTRY_OPERATION.ADD, REGISTRY_OPERATION.REMOVE),
          index: fc.integer({ min: 0, max: poolSize - 1 }),
        }),
        { maxLength: MAX_REGISTRY_OPERATIONS },
      ),
    })
  );

/** A non-empty sequence of spawn requests, each a command with its argument list. */
export const arbitrarySpawnRequests = (): fc.Arbitrary<readonly SpawnRequest[]> =>
  fc.array(
    fc.record({
      command: arbitraryDomainLiteral(),
      args: fc.array(arbitraryDomainLiteral(), { maxLength: MAX_SPAWN_ARGUMENTS }),
    }),
    { minLength: 1, maxLength: MAX_SPAWN_REQUESTS },
  );

/** A distinct, non-empty listener list for every foreground signal. */
export const arbitraryForegroundListenerSets = (): fc.Arbitrary<Map<NodeJS.Signals, SignalListener[]>> =>
  fc
    .array(fc.integer({ min: 1, max: MAX_LISTENERS_PER_SIGNAL }), {
      minLength: FOREGROUND_SIGNALS.length,
      maxLength: FOREGROUND_SIGNALS.length,
    })
    .map((counts) =>
      new Map(
        FOREGROUND_SIGNALS.map((signal, index) => [
          signal,
          Array.from({ length: counts[index] ?? 1 }, (): SignalListener => () => {}),
        ]),
      )
    );

/** A managed-subprocess run whose stdout and stderr chunks differ, so a crossed stream is observable. */
export const arbitraryManagedSubprocessCase = (): fc.Arbitrary<ManagedSubprocessCase> =>
  fc
    .record({
      command: arbitraryDomainLiteral(),
      args: fc.array(arbitraryDomainLiteral(), { minLength: 1, maxLength: MAX_SPAWN_ARGUMENTS }),
      stdoutChunk: arbitraryDomainLiteral(),
      stderrChunk: arbitraryDomainLiteral(),
      productDir: arbitrarySourceFilePath().map((sourcePath) => dirname(sourcePath)),
    })
    .filter(({ stdoutChunk, stderrChunk }) => stdoutChunk !== stderrChunk);

/** Node's `stdio` option value that connects a child's stream to a pipe the parent reads. */
export const STDIO_ORACLE = {
  PARENT_PIPE: "pipe",
} as const;
