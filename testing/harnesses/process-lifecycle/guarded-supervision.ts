/**
 * Harness for the guarded supervision of `src/lib/process-lifecycle/`.
 *
 * Two contexts serve the linked tests. The recording context drives the
 * supervisor over doubles for the spawn, the parent's signal listener set, the
 * process-group kill, and the descriptor close, and returns the observations.
 * The real-child context runs the production `guardedSupervisor` over a real
 * Node child with a real descriptor and returns what the child reported through
 * that descriptor together with the state the run left in this process.
 *
 * @module process-lifecycle/testing/guarded-supervision
 */

import { EventEmitter } from "node:events";
import { fstatSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  createGuardedSupervisor,
  createSignalSuspender,
  GUARDED_SIGNALS,
  type GuardedChild,
  type GuardedSpawn,
  type GuardedSupervisionRequest,
  type GuardedSupervisor,
  guardedSupervisor,
  lifecycleRegistry,
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
const READY_REPORT = "ready";
const REPORT_FILE_NAME = "report.txt";
const REPORT_DIR_PREFIX = "guarded-supervision-";
const READY_POLL_MS = 10;
const READY_TIMEOUT_MS = 10_000;
const REPORT_SEPARATOR = " ";
const PS_COMMAND = "ps";
const PS_GROUP_ARGS = ["-o", "pgid=", "-p"] as const;
const GONE_POLL_MS = 20;
const GONE_TIMEOUT_MS = 3_000;
const NO_SUCH_PROCESS_CODE = "ESRCH";
const GRANDCHILD_REPORT = /^ready (\d+)$/;
const GRANDCHILD_SOURCE = "setInterval(() => {}, 1000);";

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

/** The child programs a real-child run executes, each written to report through descriptor 3. */
export const REAL_CHILD_PROGRAM = {
  exitWith: (code: number): string => `process.exit(${code})`,
  reportIdentity: `const { writeSync } = require("node:fs");const { execFileSync } = require("node:child_process");`
    + `const pgid = execFileSync("${PS_COMMAND}", [${
      PS_GROUP_ARGS.map((a) => JSON.stringify(a)).join(",")
    }, String(process.pid)]).toString().trim();`
    + `writeSync(3, process.pid + "${REPORT_SEPARATOR}" + pgid);`,
  awaitSignal: `require("node:fs").writeSync(3, "${READY_REPORT}");setInterval(() => {}, 1000);`,
  awaitSignalWithGrandchild: `const { spawn } = require("node:child_process");`
    + `const grandchild = spawn(process.execPath, ["-e", ${JSON.stringify(GRANDCHILD_SOURCE)}], { stdio: "ignore" });`
    + `require("node:fs").writeSync(3, "${READY_REPORT} " + grandchild.pid);setInterval(() => {}, 1000);`,
} as const;

export interface RealChildRun {
  readonly status: number;
  readonly report: string;
  /** The descriptor the caller handed to the supervisor. */
  readonly descriptor: number;
  /** Whether that descriptor is still open in this process after the run. */
  readonly descriptorOpen: boolean;
  readonly listenersBefore: ReadonlyMap<NodeJS.Signals, readonly unknown[]>;
  readonly listenersAfter: ReadonlyMap<NodeJS.Signals, readonly unknown[]>;
  /** The lifecycle registry's size immediately after the child was spawned. */
  readonly registrySizeWhileRunning: number;
  readonly registrySizeAfter: number;
}

export interface RealChildOptions {
  /** A signal delivered to the parent's listeners once the child reports ready. */
  readonly deliverWhenReady?: NodeJS.Signals;
}

async function untilReady(reportPath: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!readFileSync(reportPath, "utf8").includes(READY_REPORT)) {
    if (Date.now() > deadline) throw new Error(`child never reported ${READY_REPORT} within ${READY_TIMEOUT_MS}ms`);
    await delay(READY_POLL_MS);
  }
}

function guardedListeners(): Map<NodeJS.Signals, readonly unknown[]> {
  return new Map(GUARDED_SIGNALS.map((signal) => [signal, process.listeners(signal)]));
}

function isDescriptorOpen(descriptor: number): boolean {
  try {
    fstatSync(descriptor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs the production `guardedSupervisor` over a real Node child executing `program`, with a real
 * descriptor. A delivered signal reaches the supervisor through the listeners installed on `process`.
 */
export async function superviseRealChild(program: string, options: RealChildOptions = {}): Promise<RealChildRun> {
  const reportPath = join(mkdtempSync(join(tmpdir(), REPORT_DIR_PREFIX)), REPORT_FILE_NAME);
  const descriptor = openSync(reportPath, "w+");
  const listenersBefore = guardedListeners();

  const running = guardedSupervisor.run({ command: process.execPath, args: ["-e", program], descriptor });
  const registrySizeWhileRunning = lifecycleRegistry.size;
  if (options.deliverWhenReady !== undefined) {
    await untilReady(reportPath);
    process.emit(options.deliverWhenReady);
  }
  const status = await running;

  return {
    status,
    report: readFileSync(reportPath, "utf8"),
    descriptor,
    descriptorOpen: isDescriptorOpen(descriptor),
    listenersBefore,
    listenersAfter: guardedListeners(),
    registrySizeWhileRunning,
    registrySizeAfter: lifecycleRegistry.size,
  };
}

/** Splits an identity report into the child's pid and process-group id. */
export function parseIdentityReport(report: string): { readonly pid: number; readonly pgid: number } {
  const [pid, pgid] = report.split(REPORT_SEPARATOR).map(Number);
  return { pid, pgid };
}

/** Reads the grandchild's pid from the report of `awaitSignalWithGrandchild`. */
export function parseGrandchildPid(report: string): number {
  const match = GRANDCHILD_REPORT.exec(report.trim());
  if (match === null) throw new Error(`no grandchild pid in report: ${report}`);
  return Number(match[1]);
}

/**
 * Whether the process ends within the wait. A process still alive at the deadline is killed so a
 * failing run leaves nothing behind.
 */
export async function processEnds(pid: number): Promise<boolean> {
  const deadline = Date.now() + GONE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === NO_SUCH_PROCESS_CODE) return true;
      throw error;
    }
    await delay(GONE_POLL_MS);
  }
  process.kill(pid, "SIGKILL");
  return false;
}
