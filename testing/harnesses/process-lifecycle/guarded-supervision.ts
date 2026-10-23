/**
 * Harness for the guarded supervision of `src/lib/process-lifecycle/`.
 *
 * Two contexts serve the linked tests. The recording context drives the
 * supervisor over doubles for the spawn, the parent's signal listener set, the
 * process-group kill, and the descriptor close, and returns the observations.
 * The real-child context runs the supervisor over a real Node child with a real
 * descriptor and returns what the child reported through that descriptor.
 *
 * @module process-lifecycle/testing/guarded-supervision
 */

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { closeSync, mkdtempSync, openSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import * as fc from "fast-check";
import ts from "typescript";

import {
  createGuardedSupervisor,
  createSignalSuspender,
  GUARDED_SIGNALS,
  type GuardedChild,
  type GuardedSpawn,
  type GuardedSupervisionRequest,
  type GuardedSupervisor,
} from "@/lib/process-lifecycle";
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

/** A recording child whose exit the test drives. */
export class RecordingGuardedChild extends EventEmitter implements GuardedChild {
  constructor(readonly pid: number | undefined = fc.sample(fc.integer({ min: 2, max: 99_999 }), 1)[0]) {
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
  const initialListeners = new Map(
    GUARDED_SIGNALS.map((signal) => {
      const count = fc.sample(fc.integer({ min: 1, max: 3 }), 1)[0];
      return [signal, Array.from({ length: count }, () => () => {})] as const;
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

  const request: GuardedSupervisionRequest = {
    command: fc.sample(fc.stringMatching(/^[a-z]{3,10}$/), 1)[0],
    args: fc.sample(fc.array(fc.stringMatching(/^[a-z]{1,8}$/), { maxLength: 3 }), 1)[0],
    descriptor: fc.sample(fc.integer({ min: 4, max: 200 }), 1)[0],
  };

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

/** Every exit signal a child can be ended by, drawn from the guarded set and others. */
export function arbitraryEndingSignal(): fc.Arbitrary<NodeJS.Signals> {
  return fc.constantFrom<NodeJS.Signals>("SIGINT", "SIGTERM", "SIGHUP", "SIGKILL", "SIGUSR1");
}

export function arbitraryGuardedSignal(): fc.Arbitrary<NodeJS.Signals> {
  return fc.constantFrom(...GUARDED_SIGNALS);
}

export function arbitraryExitCode(): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: 125 });
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
} as const;

export interface RealChildRun {
  readonly status: number;
  readonly report: string;
  readonly parentListeners: ReadonlyMap<NodeJS.Signals, number>;
  readonly closedDescriptors: number[];
}

export interface RealChildOptions {
  /** A signal delivered to the supervisor's target once the child reports ready. */
  readonly deliverWhenReady?: NodeJS.Signals;
}

async function untilReady(reportPath: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (!readFileSync(reportPath, "utf8").includes(READY_REPORT)) {
    if (Date.now() > deadline) throw new Error(`child never reported ${READY_REPORT} within ${READY_TIMEOUT_MS}ms`);
    await delay(READY_POLL_MS);
  }
}

/** Runs the supervisor over a real Node child executing `program`, with a real descriptor. */
export async function superviseRealChild(program: string, options: RealChildOptions = {}): Promise<RealChildRun> {
  const reportPath = join(mkdtempSync(join(tmpdir(), REPORT_DIR_PREFIX)), REPORT_FILE_NAME);
  const descriptor = openSync(reportPath, "w+");
  const target = new DeliveringSignalTarget();
  const closedDescriptors: number[] = [];

  const supervisor = createGuardedSupervisor({
    spawn: (command, args, spawnOptions) => spawn(command, [...args], spawnOptions),
    signalTarget: target,
    signalSuspender: createSignalSuspender(target, GUARDED_SIGNALS),
    killProcessGroup: (pid, signal) => {
      process.kill(-pid, signal);
    },
    closeDescriptor: (fd) => {
      closedDescriptors.push(fd);
      closeSync(fd);
    },
  });

  const running = supervisor.run({ command: process.execPath, args: ["-e", program], descriptor });
  if (options.deliverWhenReady !== undefined) {
    await untilReady(reportPath);
    target.deliver(options.deliverWhenReady);
  }
  const status = await running;

  return {
    status,
    report: readFileSync(reportPath, "utf8"),
    parentListeners: new Map(GUARDED_SIGNALS.map((signal) => [signal, target.listeners(signal).length])),
    closedDescriptors,
  };
}

/** Splits an identity report into the child's pid and process-group id. */
export function parseIdentityReport(report: string): { readonly pid: number; readonly pgid: number } {
  const [pid, pgid] = report.split(REPORT_SEPARATOR).map(Number);
  return { pid, pgid };
}

const PRODUCTION_SOURCE_DIR = "src";

/** Repository-relative path of the guarded runner, the one module allowed to set `detached: true`. */
export const GUARDED_RUNNER_SOURCE_PATH = "src/lib/process-lifecycle/guarded-supervision.ts";
const TYPESCRIPT_SOURCE_SUFFIX = ".ts";
const DETACHED_PROPERTY = "detached";

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return entry.name.endsWith(TYPESCRIPT_SOURCE_SUFFIX) ? [path] : [];
  });
}

function setsDetachedTrue(path: string): boolean {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node)
      && node.name.getText(source) === DETACHED_PROPERTY
      && node.initializer.kind === ts.SyntaxKind.TrueKeyword
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Repository-relative paths of production modules that set `detached: true` on a spawn. */
export function productionDetachedSpawnSites(root: string = process.cwd()): string[] {
  return sourceFilesUnder(join(root, PRODUCTION_SOURCE_DIR))
    .filter(setsDetachedTrue)
    .map((path) => relative(root, path))
    .sort((a, b) => a.localeCompare(b));
}
