/**
 * Guarded supervision for the process-lifecycle module.
 *
 * A guarded supervision spawns one child with inherited standard streams, an
 * inherited copy of one caller-supplied descriptor at the reserved descriptor
 * number, and its own process group. While the child runs, the parent's
 * SIGINT, SIGTERM, and SIGHUP listeners are suspended and each such signal the
 * parent receives is forwarded once to the child's process group. The child
 * stays out of the lifecycle registry, so lifecycle cleanup never signals it a
 * second time. When the child ends, the supervisor restores the listeners,
 * closes its own copy of the descriptor, and reports the child's status.
 *
 * Every collaborator enters through `GuardedSupervisionDeps`, so the contract
 * verifies over recording doubles and over a real child alike.
 *
 * @module lib/process-lifecycle/guarded-supervision
 */

import type { SpawnOptions } from "node:child_process";
import { constants as osConstants } from "node:os";

import { SIGNAL_EXIT_CODE_BASE, UNKNOWN_CHILD_EXIT_CODE } from "./exit-codes";
import type { SignalSuspender, SignalTarget } from "./foreground-handoff";

/** The descriptor number at which the child holds the caller-supplied descriptor. */
export const GUARDED_DESCRIPTOR_NUMBER = 3;

/** Signals the supervisor forwards to the guarded child's process group. */
export const GUARDED_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/** The stdio disposition of the guarded child's standard streams. */
export const INHERITED_STDIO = "inherit";
const NO_SUCH_PROCESS_CODE = "ESRCH";

export type GuardedExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;

/** The subset of a spawned child the supervisor depends on; a real `ChildProcess` satisfies it. */
export interface GuardedChild {
  readonly pid?: number;
  once(event: "exit", listener: GuardedExitListener): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
}

export type GuardedSpawn = (command: string, args: readonly string[], options: SpawnOptions) => GuardedChild;

export interface GuardedSupervisionDeps {
  readonly spawn: GuardedSpawn;
  /** The parent's signal listener set — `process` in production. */
  readonly signalTarget: SignalTarget;
  /** Suspends the parent's listeners for `GUARDED_SIGNALS` for the child's lifetime. */
  readonly signalSuspender: SignalSuspender;
  /** Delivers a signal to the process group led by `pid`. */
  readonly killProcessGroup: (pid: number, signal: NodeJS.Signals) => void;
  /** Closes the supervisor's own copy of the caller-supplied descriptor. */
  readonly closeDescriptor: (descriptor: number) => void;
}

export interface GuardedSupervisionRequest {
  readonly command: string;
  readonly args: readonly string[];
  /** The caller's open descriptor the child inherits at `GUARDED_DESCRIPTOR_NUMBER`. */
  readonly descriptor: number;
}

export interface GuardedSupervisor {
  /** Runs the guarded child to completion and resolves with its reported exit status. */
  run(request: GuardedSupervisionRequest): Promise<number>;
}

/** Maps a child's exit code or terminating signal to the status the supervisor reports. */
export function guardedExitStatus(code: number | null, signal: NodeJS.Signals | null): number {
  if (code !== null) return code;
  if (signal !== null) return SIGNAL_EXIT_CODE_BASE + osConstants.signals[signal];
  return UNKNOWN_CHILD_EXIT_CODE;
}

export function createGuardedSupervisor(deps: GuardedSupervisionDeps): GuardedSupervisor {
  return {
    run(request) {
      return new Promise<number>((resolve, reject) => {
        let childPid: number | undefined;
        let settled = false;

        const restoreSignals = deps.signalSuspender.suspend();
        const forwarders = GUARDED_SIGNALS.map((signal) => {
          const listener = (): void => {
            if (childPid === undefined) return;
            try {
              deps.killProcessGroup(childPid, signal);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== NO_SUCH_PROCESS_CODE) throw error;
            }
          };
          deps.signalTarget.on(signal, listener);
          return { signal, listener };
        });

        const finish = (settle: () => void): void => {
          if (settled) return;
          settled = true;
          for (const { signal, listener } of forwarders) deps.signalTarget.removeListener(signal, listener);
          restoreSignals();
          deps.closeDescriptor(request.descriptor);
          settle();
        };

        let child: GuardedChild;
        try {
          child = deps.spawn(request.command, request.args, {
            stdio: [INHERITED_STDIO, INHERITED_STDIO, INHERITED_STDIO, request.descriptor],
            detached: true,
          });
        } catch (error) {
          finish(() => reject(error));
          return;
        }
        childPid = child.pid;
        child.once("exit", (code, signal) => finish(() => resolve(guardedExitStatus(code, signal))));
        child.once("error", (error) => finish(() => reject(error)));
      });
    },
  };
}
