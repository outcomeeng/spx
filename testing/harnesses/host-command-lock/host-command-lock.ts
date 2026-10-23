/**
 * Harness for the host command lock.
 *
 * Owns the resources the linked tests share: a temporary orchestration lock file location, real
 * supervisor processes that run the production library, real worker processes that report activity
 * through files, a dilated clock that runs the load window and the wait cap fast over real
 * contention, and a fake clock with a scripted load source and a recording lock binding for
 * deterministic admission. Every member returns handles and observations; the linked tests own
 * every predicate.
 *
 * @module host-command-lock/testing/host-command-lock
 */
import { type ChildProcess, spawn } from "node:child_process";
import { closeSync, existsSync, fstatSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  type HostCommandLockDeps,
  type LoadSample,
  LOCK_ENV,
  type LockBinding,
  type ResultLine,
  type RunRequest,
} from "@/lib/host-command-lock";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const TEMP_PREFIX = "host-command-lock-";
const LOCK_FILE_NAME = "orchestration.lock";
// One Node process runs the supervisor, so its process id and descriptors are the supervisor's own.
const NODE_BIN = process.execPath;
const TSX_LOADER_ARGS = ["--import", "tsx"];
const SUPERVISOR_ENTRY = join("testing", "harnesses", "host-command-lock", "supervisor-process.ts");
const POLL_MS = 25;
const WAIT_TIMEOUT_MS = 20_000;
const HEARTBEAT_MS = 40;
const ACTIVITY_WINDOW_MS = 400;
const WORKER_PID_FILE = "worker.pid";
const WORKER_HEARTBEAT_FILE = "worker.heartbeat";
const RESULT_LINE_START = "{";
const TIME_DILATION = 1_000;
const QUIET_CPU_COUNT = 8;
const QUIET_LOAD = 0;

/** How long a test observes a waiter that must stay unadmitted while a worker is active. */
export const OBSERVATION_MS = 600;

export interface LockEnv {
  readonly dir: string;
  readonly lockPath: string;
  readonly env: Record<string, string>;
}

/** A fresh orchestration lock location; the environment names it through the production override variable. */
export async function withLockEnv<T>(callback: (lock: LockEnv) => Promise<T>): Promise<T> {
  return withTempDir(TEMP_PREFIX, async (dir) => {
    const lockPath = join(dir, LOCK_FILE_NAME);
    return callback({ dir, lockPath, env: { ...inheritedEnv(), [LOCK_ENV.PATH_OVERRIDE]: lockPath } });
  });
}

function inheritedEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

/**
 * Production dependencies with a dilated monotonic clock and a quiet load source: real contention
 * and real children, with a 30-second load window that passes in milliseconds.
 */
export function dilatedDeps(lockPath: string): Partial<HostCommandLockDeps> {
  const origin = performance.now();
  const nowMs = (): number => (performance.now() - origin) * TIME_DILATION;
  return {
    lockPath,
    clock: { nowMs },
    sleep: (ms: number) => delay(ms / TIME_DILATION),
    loadSource: {
      cpuCount: QUIET_CPU_COUNT,
      sample: () => ({ atMs: nowMs(), one: QUIET_LOAD, five: QUIET_LOAD, fifteen: QUIET_LOAD }),
    },
  };
}

export interface ExitObservation {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface SupervisorRun {
  readonly child: ChildProcess;
  readonly pid: number;
  readonly exit: Promise<ExitObservation>;
  stderr(): string;
  resultLine(): ResultLine | undefined;
}

export interface SupervisorOptions {
  readonly env?: Record<string, string>;
  readonly inheritedFds?: readonly number[];
  /** The supervisor kills itself with SIGKILL at the holder-record write with this 1-based ordinal. */
  readonly killOnRecordWrite?: number;
}

/** The record write that precedes the spawn: the child's process group is still unknown. */
export const RECORD_WRITE_BEFORE_SPAWN = 1;
/** The record write that follows the spawn: it carries the child's process group. */
export const RECORD_WRITE_AFTER_SPAWN = 2;

/** Starts one real supervisor process in its own process group, as an agent tool would. */
export function startSupervisor(lock: LockEnv, request: RunRequest, options: SupervisorOptions = {}): SupervisorRun {
  const child = spawn(NODE_BIN, [
    ...TSX_LOADER_ARGS,
    SUPERVISOR_ENTRY,
    JSON.stringify(request),
    String(options.killOnRecordWrite ?? 0),
  ], {
    env: options.env ?? lock.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe", ...(options.inheritedFds ?? [])],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const exit = new Promise<ExitObservation>((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  return {
    child,
    pid: child.pid as number,
    exit,
    stderr: () => stderr,
    resultLine: () => parseResultLine(stderr),
  };
}

function parseResultLine(stderr: string): ResultLine | undefined {
  const last = stderr.trimEnd().split("\n").pop();
  if (last === undefined || !last.startsWith(RESULT_LINE_START)) return undefined;
  return JSON.parse(last) as ResultLine;
}

/** The argv that starts a nested supervisor as a guarded command's workload. */
export function nestedSupervisorWorkload(request: RunRequest): readonly string[] {
  return [NODE_BIN, ...TSX_LOADER_ARGS, SUPERVISOR_ENTRY, JSON.stringify(request)];
}

/** Signals a supervisor's whole process group, as a harness tool timeout does. */
export function signalGroup(run: SupervisorRun, signal: NodeJS.Signals): void {
  process.kill(-run.pid, signal);
}

/** Signals the supervisor process alone. */
export function signalSupervisor(run: SupervisorRun, signal: NodeJS.Signals): void {
  process.kill(run.pid, signal);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function waitUntil(condition: () => boolean, timeoutMs: number = WAIT_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for an observable condition");
    await delay(POLL_MS);
  }
}

/** A workload: a Node worker that records its pid, then heartbeats into a file until killed. */
export function workerWorkload(markerDir: string): readonly string[] {
  const source = [
    "const fs=require('fs'),path=require('path');",
    `fs.writeFileSync(path.join(${JSON.stringify(markerDir)},${JSON.stringify(WORKER_PID_FILE)}),String(process.pid));`,
    `setInterval(()=>fs.writeFileSync(path.join(${JSON.stringify(markerDir)},${
      JSON.stringify(WORKER_HEARTBEAT_FILE)
    }),String(Date.now())),${HEARTBEAT_MS});`,
  ].join("");
  return [process.execPath, "-e", source];
}

/** A workload that starts a worker inheriting every descriptor, then exits at once. */
export function leavingWorkload(markerDir: string): readonly string[] {
  const worker = workerWorkload(markerDir).slice(1);
  const source = [
    "const {spawn}=require('child_process');",
    `spawn(process.execPath,${JSON.stringify(worker)},{stdio:['inherit','inherit','inherit',3]}).unref();`,
  ].join("");
  return [process.execPath, "-e", source];
}

/** A workload that exits with the given status. */
export function exitingWorkload(code: number): readonly string[] {
  return [process.execPath, "-e", `process.exit(${code})`];
}

/** A workload that appends its start and end instants to `<markerDir>/<label>.interval`. */
export function intervalWorkload(markerDir: string, label: string, durationMs: number): readonly string[] {
  const file = JSON.stringify(join(markerDir, `${label}.interval`));
  const source = String.raw`const fs=require('fs');fs.appendFileSync(${file},'start '+Date.now()+'\n');`
    + String.raw`setTimeout(()=>{fs.appendFileSync(${file},'end '+Date.now()+'\n')},${durationMs});`;
  return [process.execPath, "-e", source];
}

export interface Interval {
  readonly startMs: number;
  readonly endMs: number;
}

export function readInterval(markerDir: string, label: string): Interval {
  const lines = readFileSync(join(markerDir, `${label}.interval`), "utf8").trim().split("\n");
  const at = (name: string): number => Number(lines.find((line) => line.startsWith(name))?.split(" ")[1]);
  return { startMs: at("start"), endMs: at("end") };
}

export function intervalStarted(markerDir: string, label: string): boolean {
  return existsSync(join(markerDir, `${label}.interval`));
}

export function workerPid(markerDir: string): number {
  return Number(readFileSync(join(markerDir, WORKER_PID_FILE), "utf8"));
}

export function workerPidRecorded(markerDir: string): boolean {
  return existsSync(join(markerDir, WORKER_PID_FILE));
}

/** The worker is active when its heartbeat file changed within the activity window: a signal independent of any descriptor. */
export function workerActive(markerDir: string): boolean {
  const heartbeat = join(markerDir, WORKER_HEARTBEAT_FILE);
  return existsSync(heartbeat) && Date.now() - statSync(heartbeat).mtimeMs < ACTIVITY_WINDOW_MS;
}

/** Observations of a deterministic admission run over a fake clock, a scripted load source, and a recording binding. */
export interface ScriptedAdmission {
  readonly deps: Partial<HostCommandLockDeps>;
  /** Fake-clock readings at which the load source was sampled. */
  readonly sampleTimesMs: number[];
  /** Fake-clock readings at which a lock attempt succeeded. */
  readonly lockTakenAtMs: number[];
  /** Fake-clock readings of every explicit unlock the binding received. */
  readonly unlockAtMs: number[];
  /** Fake-clock readings of lock attempts that found the lock busy. */
  readonly busyAttemptsAtMs: number[];
  nowMs(): number;
}

export interface AdmissionScript {
  /** Samples served in order from the first sample after the slot is held; the last repeats. */
  readonly samples: readonly Omit<LoadSample, "atMs">[];
  readonly cpuCount: number;
  /** Fake-clock reading at which the slot becomes free; `Number.POSITIVE_INFINITY` keeps it busy. */
  readonly slotFreeAtMs: number;
  /** Extra fake-clock milliseconds that pass before the sample at the given index is taken. */
  readonly stallBeforeSampleMs?: Readonly<Record<number, number>>;
}

/** The lock binding double answers busy until the script frees the slot, and records every unlock. */
export function scriptedAdmission(script: AdmissionScript, lockFile: Pick<LockEnv, "lockPath">): ScriptedAdmission {
  let clock = 0;
  let sampleIndex = 0;
  const sampleTimesMs: number[] = [];
  const lockTakenAtMs: number[] = [];
  const unlockAtMs: number[] = [];
  const busyAttemptsAtMs: number[] = [];
  const binding: LockBinding = {
    tryLock: () => {
      if (clock >= script.slotFreeAtMs) {
        lockTakenAtMs.push(clock);
        return true;
      }
      busyAttemptsAtMs.push(clock);
      return false;
    },
    unlock: () => {
      unlockAtMs.push(clock);
    },
  };
  const deps: Partial<HostCommandLockDeps> = {
    binding,
    clock: { nowMs: () => clock },
    sleep: async (ms: number) => {
      clock += ms;
    },
    randomDelayMs: () => 0,
    loadSource: {
      cpuCount: script.cpuCount,
      sample: () => {
        clock += script.stallBeforeSampleMs?.[sampleIndex] ?? 0;
        sampleTimesMs.push(clock);
        const sample = script.samples[Math.min(sampleIndex, script.samples.length - 1)];
        sampleIndex += 1;
        return { ...sample, atMs: clock };
      },
    },
    lockPath: lockFile.lockPath,
  };
  return { deps, sampleTimesMs, lockTakenAtMs, unlockAtMs, busyAttemptsAtMs, nowMs: () => clock };
}

const PGID_FILE = "pgids.json";

/** A workload that records its own process group and its parent's process group. */
export function pgidWorkload(markerDir: string): readonly string[] {
  const source = "const cp=require('child_process'),fs=require('fs');"
    + "const g=(p)=>Number(cp.execFileSync('ps',['-o','pgid=','-p',String(p)]).toString().trim());"
    + `fs.writeFileSync(${
      JSON.stringify(join(markerDir, PGID_FILE))
    },JSON.stringify({own:g(process.pid),parent:g(process.ppid)}));`;
  return [process.execPath, "-e", source];
}

export interface RecordedGroups {
  readonly own: number;
  readonly parent: number;
}

export function readGroups(markerDir: string): RecordedGroups {
  return JSON.parse(readFileSync(join(markerDir, PGID_FILE), "utf8")) as RecordedGroups;
}

/** A lock binding over the production one that replaces the lock file's inode at the moment the lock is taken. */
export function replacingBinding(lockPath: string, production: LockBinding): LockBinding {
  return {
    ...production,
    tryLock: (fd: number) => {
      const taken = production.tryLock(fd);
      renameSync(lockPath, `${lockPath}.replaced`);
      writeFileSync(lockPath, "");
      return taken;
    },
  };
}

/** A descriptor opened on a file, closed by the returned callback. */
export interface OpenDescriptor {
  readonly fd: number;
  readonly fileId: string;
  close(): void;
}

export function openDescriptor(path: string): OpenDescriptor {
  const fd = openSync(path, "a+");
  const stat = fstatSync(fd);
  return { fd, fileId: `${stat.dev}:${stat.ino}`, close: () => closeSync(fd) };
}

/** Creates an empty file at `path` when none exists, and returns its device and inode as `<device>:<inode>`. */
export function touchedFileId(path: string): string {
  const descriptor = openDescriptor(path);
  descriptor.close();
  return descriptor.fileId;
}

/** The argv that starts a nested supervisor under `env`, so the nested call resolves its own environment. */
export function nestedSupervisorWorkloadWithEnv(
  request: RunRequest,
  overrides: Readonly<Record<string, string>>,
): readonly string[] {
  return [
    "env",
    ...Object.entries(overrides).map(([key, value]) => `${key}=${value}`),
    ...nestedSupervisorWorkload(request),
  ];
}
