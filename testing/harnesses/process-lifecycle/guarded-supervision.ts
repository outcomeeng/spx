/**
 * Harness for the guarded supervision of `src/lib/process-lifecycle/`.
 *
 * The recording context drives the supervisor over in-memory doubles for the spawn, the parent's
 * signal listener set, the process-group kill, and the descriptor close, and returns the
 * observations. No process starts, no signal is sent, and no file is opened.
 *
 * @module process-lifecycle/testing/guarded-supervision
 */

import { EventEmitter } from "node:events";

import {
  createGuardedSupervisor,
  createSignalSuspender,
  GUARDED_SIGNALS,
  type GuardedChild,
  type GuardedSpawn,
  type GuardedSupervisionRequest,
  type GuardedSupervisor,
} from "@/lib/process-lifecycle";
import {
  arbitraryChildPid,
  arbitraryGuardedRequest,
  arbitraryListenerCounts,
} from "@testing/generators/process-lifecycle/guarded-supervision";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { RecordingSignalTarget } from "@testing/harnesses/process-lifecycle/signal-target";

const EXIT_EVENT = "exit";
const ERROR_EVENT = "error";

/** A recording child whose exit the test drives. */
export class RecordingGuardedChild extends EventEmitter implements GuardedChild {
  constructor(readonly pid: number | undefined = sampleGeneratedValue(arbitraryChildPid())) {
    super();
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.emit(EXIT_EVENT, code, signal);
  }

  emitError(error: Error): void {
    this.emit(ERROR_EVENT, error);
  }
}

/** A signal target that can deliver a signal to the listeners currently installed on it. */
export class DeliveringSignalTarget extends RecordingSignalTarget {
  deliver(signal: NodeJS.Signals): void {
    for (const listener of this.listeners(signal)) listener(signal);
  }
}

export interface RecordedSpawn {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: Parameters<GuardedSpawn>[2];
}

export interface RecordingGuardedContext {
  readonly supervisor: GuardedSupervisor;
  readonly child: RecordingGuardedChild;
  readonly target: DeliveringSignalTarget;
  readonly spawns: RecordedSpawn[];
  readonly groupKills: Array<{ readonly pid: number; readonly signal: NodeJS.Signals }>;
  readonly closedDescriptors: number[];
  /** Listener counts per guarded signal observed on the target at spawn time. */
  readonly listenersAtSpawn: Map<NodeJS.Signals, number>;
  readonly initialListeners: ReadonlyMap<NodeJS.Signals, readonly (() => void)[]>;
  readonly request: GuardedSupervisionRequest;
}

/** Builds a supervisor over recording doubles, with generated parent listeners and request. */
export function createRecordingGuardedContext(): RecordingGuardedContext {
  const counts = sampleGeneratedValue(arbitraryListenerCounts());
  const initialListeners = new Map(
    GUARDED_SIGNALS.map((signal, index) => {
      return [signal, Array.from({ length: counts[index] }, () => () => {})] as const;
    }),
  );
  const target = new DeliveringSignalTarget(initialListeners);
  const child = new RecordingGuardedChild();
  const spawns: RecordedSpawn[] = [];
  const groupKills: Array<{ pid: number; signal: NodeJS.Signals }> = [];
  const closedDescriptors: number[] = [];
  const listenersAtSpawn = new Map<NodeJS.Signals, number>();

  const supervisor = createGuardedSupervisor({
    spawn: (command, args, options) => {
      spawns.push({ command, args, options });
      for (const signal of GUARDED_SIGNALS) listenersAtSpawn.set(signal, target.listeners(signal).length);
      return child;
    },
    signalTarget: target,
    signalSuspender: createSignalSuspender(target, GUARDED_SIGNALS),
    killProcessGroup: (pid, signal) => {
      groupKills.push({ pid, signal });
    },
    closeDescriptor: (descriptor) => {
      closedDescriptors.push(descriptor);
    },
  });

  const request: GuardedSupervisionRequest = sampleGeneratedValue(arbitraryGuardedRequest());

  return {
    supervisor,
    child,
    target,
    spawns,
    groupKills,
    closedDescriptors,
    listenersAtSpawn,
    initialListeners,
    request,
  };
}
