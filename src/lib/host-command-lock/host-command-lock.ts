/**
 * The host command lock: one host-wide slot that a guarded command holds for its whole process
 * tree, admitted after a quiet load window and within a wait cap, and ended by one terminal
 * result.
 *
 * The slot is an exclusive `flock` lock on the orchestration lock file. The supervisor passes its
 * locked descriptor to the child, so the kernel keeps the slot held until the last holder of that
 * open file description exits. Every collaborator enters through `HostCommandLockDeps`.
 *
 * @module lib/host-command-lock/host-command-lock
 */
import type { ChildProcess } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";
import { availableParallelism, loadavg } from "node:os";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { CONFIG_PROCESS_CWD } from "@/lib/config/cwd";
import {
  createProcessGuardedSupervisor,
  GUARDED_DESCRIPTOR_NUMBER,
  type GuardedChild,
  guardedExitStatus,
  type GuardedSpawn,
  guardedSpawn,
  type GuardedSupervisor,
  INHERITED_STDIO,
} from "@/lib/process-lifecycle";

import { defaultLockBinding, type LockBinding } from "./binding";
import {
  BUSY_RETRY_BASE_MS,
  BUSY_RETRY_JITTER_MS,
  DEFAULT_WAIT_SECONDS,
  LOAD_WINDOW,
  LOCK_ENV,
  MILLISECONDS_PER_SECOND,
  SUPPORTED_PLATFORM,
} from "./constants";
import { defaultFilesystem, type HolderRecord, type HostCommandLockFilesystem } from "./filesystem";
import {
  gapExceedsLimit,
  type LoadSample,
  sampleExceedsLimit,
  sampleIsValid,
  windowAdmits,
  windowHasEnoughSamples,
} from "./load-gate";
import { type Environment, resolveLockPath } from "./lock-path";
import { OUTCOME_KIND, type ResultLine, type TerminalOutcome, terminalOutcome } from "./result";

export interface LoadSource {
  readonly cpuCount: number;
  sample(): LoadSample;
}

export interface Platform {
  readonly os: string;
  readonly arch: string;
}

export interface HostCommandLockDeps {
  /** The orchestration lock file; resolved from the environment when absent. */
  readonly lockPath?: string;
  readonly environment: Environment;
  readonly platform: Platform;
  /** Monotonic clock in milliseconds. */
  readonly clock: { nowMs(): number };
  /** Wall-clock instant for the holder record. */
  readonly wallClockMs: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** Jitter added to the busy-retry delay, in `[0, BUSY_RETRY_JITTER_MS)`. */
  readonly randomDelayMs: () => number;
  readonly loadSource: LoadSource;
  readonly binding: LockBinding;
  readonly filesystem: HostCommandLockFilesystem;
  readonly spawn: GuardedSpawn;
  readonly createSupervisor: (spawnChild: GuardedSpawn) => GuardedSupervisor;
  readonly generateRunId: () => string;
  readonly processId: number;
  readonly workingDirectory: string;
}

export interface RunRequest {
  /** The command and its arguments; the first element is the executable. */
  readonly command: readonly string[];
  readonly cwd?: string;
  /** Echoed in the result line; generated when absent. */
  readonly runId?: string;
  /** Overrides the default wait cap. */
  readonly waitSeconds?: number;
}

export interface RunReport {
  readonly exitCode: number;
  /** The terminal result line; absent for a nested pass-through. */
  readonly result?: ResultLine;
}

export interface HostCommandLock {
  run(request: RunRequest): Promise<RunReport>;
}

const BASE_TEN = 10;
const CHILD_DESCRIPTOR_ENV_VALUE = String(GUARDED_DESCRIPTOR_NUMBER);

function productionLoadSource(): LoadSource {
  return {
    cpuCount: availableParallelism(),
    sample: () => {
      const [one, five, fifteen] = loadavg();
      return { atMs: performance.now(), one, five, fifteen };
    },
  };
}

function productionDeps(): HostCommandLockDeps {
  return {
    environment: process.env,
    platform: { os: process.platform, arch: process.arch },
    clock: { nowMs: () => performance.now() },
    wallClockMs: () => Date.now(),
    sleep: (ms) => delay(ms),
    randomDelayMs: () => randomInt(BUSY_RETRY_JITTER_MS),
    loadSource: productionLoadSource(),
    binding: defaultLockBinding,
    filesystem: defaultFilesystem,
    spawn: guardedSpawn,
    createSupervisor: createProcessGuardedSupervisor,
    generateRunId: randomUUID,
    processId: process.pid,
    workingDirectory: CONFIG_PROCESS_CWD.read(),
  };
}

function definedEntries(environment: Environment): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function isNestedContext(environment: Environment): boolean {
  return environment[LOCK_ENV.FD] !== undefined || environment[LOCK_ENV.FILE_ID] !== undefined;
}

export function createHostCommandLock(overrides: Partial<HostCommandLockDeps> = {}): HostCommandLock {
  const deps: HostCommandLockDeps = { ...productionDeps(), ...overrides };

  return {
    async run(request) {
      const runId = request.runId ?? deps.generateRunId();
      const report = (outcome: TerminalOutcome): RunReport => terminalOutcome(outcome, runId);

      if (request.command.length === 0 || !waitSecondsIsValid(request.waitSeconds)) {
        return report({ kind: OUTCOME_KIND.INVALID_ARGUMENTS });
      }
      if (deps.platform.os !== SUPPORTED_PLATFORM.os || deps.platform.arch !== SUPPORTED_PLATFORM.arch) {
        return report({ kind: OUTCOME_KIND.UNSUPPORTED_PLATFORM });
      }
      const resolution = deps.lockPath === undefined
        ? resolveLockPath(deps.environment)
        : { ok: true as const, path: deps.lockPath };
      if (!resolution.ok) return report({ kind: OUTCOME_KIND.INVALID_ARGUMENTS });

      try {
        return isNestedContext(deps.environment)
          ? await runNested(deps, request, resolution.path, report)
          : await runOutermost(deps, request, resolution.path, runId, report);
      } catch {
        return report({ kind: OUTCOME_KIND.LOCK_FILE_ERROR });
      }
    },
  };
}

function waitSecondsIsValid(waitSeconds: number | undefined): boolean {
  return waitSeconds === undefined || (Number.isFinite(waitSeconds) && waitSeconds > 0);
}

type Reporter = (outcome: TerminalOutcome) => RunReport;

/** Why a nested context is unusable, or undefined when the descriptor still holds the outer lock. */
function nestedContextFailure(
  deps: HostCommandLockDeps,
  lockPath: string,
): typeof OUTCOME_KIND.NESTED_CONTEXT_INVALID | typeof OUTCOME_KIND.NESTED_LOCK_MISMATCH | undefined {
  const fs = deps.filesystem;
  const expectedId = deps.environment[LOCK_ENV.FILE_ID];
  if (expectedId === undefined) return OUTCOME_KIND.NESTED_CONTEXT_INVALID;
  if (fs.fileIdOfPath(lockPath) !== expectedId) return OUTCOME_KIND.NESTED_LOCK_MISMATCH;

  const fd = Number.parseInt(deps.environment[LOCK_ENV.FD] ?? "", BASE_TEN);
  if (!Number.isInteger(fd)) return OUTCOME_KIND.NESTED_CONTEXT_INVALID;
  try {
    if (fs.fileIdOfDescriptor(fd) !== expectedId) return OUTCOME_KIND.NESTED_CONTEXT_INVALID;
  } catch {
    return OUTCOME_KIND.NESTED_CONTEXT_INVALID;
  }

  const probe = fs.openProbe(lockPath);
  const heldByAnyone = !deps.binding.tryLock(probe);
  fs.close(probe);
  if (!heldByAnyone) return OUTCOME_KIND.NESTED_CONTEXT_INVALID;
  return deps.binding.tryLock(fd) ? undefined : OUTCOME_KIND.NESTED_CONTEXT_INVALID;
}

/** A guarded call inside a running guarded command: it runs under the outer slot, in the outer process group. */
async function runNested(
  deps: HostCommandLockDeps,
  request: RunRequest,
  lockPath: string,
  report: Reporter,
): Promise<RunReport> {
  const failure = nestedContextFailure(deps, lockPath);
  if (failure !== undefined) return report({ kind: failure });

  const fd = Number.parseInt(deps.environment[LOCK_ENV.FD] as string, BASE_TEN);
  const [executable, ...args] = request.command;
  const status = await new Promise<number>((resolve, reject) => {
    const child: GuardedChild = deps.spawn(executable, args, {
      stdio: [INHERITED_STDIO, INHERITED_STDIO, INHERITED_STDIO, fd],
      cwd: request.cwd,
      env: definedEntries(deps.environment),
    });
    child.once("exit", (code, signal) => resolve(guardedExitStatus(code, signal)));
    child.once("error", reject);
  }).catch(() => undefined);
  return status === undefined ? report({ kind: OUTCOME_KIND.SPAWN_FAILED }) : { exitCode: status };
}

interface ChildEnd {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

async function runOutermost(
  deps: HostCommandLockDeps,
  request: RunRequest,
  lockPath: string,
  runId: string,
  report: Reporter,
): Promise<RunReport> {
  const fs = deps.filesystem;
  const startMs = deps.clock.nowMs();
  const capMs = (request.waitSeconds ?? DEFAULT_WAIT_SECONDS) * MILLISECONDS_PER_SECOND;
  const capExpired = (): boolean => deps.clock.nowMs() - startMs >= capMs;

  fs.ensureDirectory(dirname(lockPath));
  const fd = fs.openLockFile(lockPath);
  let handedToChild = false;
  try {
    if (fs.ownerOf(fd) !== process.getuid?.() || !fs.isRegularFile(fd) || !fs.isLocalStorage(lockPath)) {
      return report({ kind: OUTCOME_KIND.LOCK_FILE_ERROR });
    }

    while (!deps.binding.tryLock(fd)) {
      if (capExpired()) return report({ kind: OUTCOME_KIND.NOT_READY });
      await deps.sleep(BUSY_RETRY_BASE_MS + deps.randomDelayMs());
    }
    const fileId = fs.fileIdOfDescriptor(fd);
    if (fs.fileIdOfPath(lockPath) !== fileId) return report({ kind: OUTCOME_KIND.LOCK_FILE_ERROR });

    if (!(await admitAfterQuietWindow(deps, capExpired))) return report({ kind: OUTCOME_KIND.NOT_READY });

    const holder: HolderRecord = {
      runId,
      supervisorPid: deps.processId,
      workingDirectory: request.cwd ?? deps.workingDirectory,
      startedAt: new Date(deps.wallClockMs()).toISOString(),
      childProcessGroup: null,
    };
    fs.writeHolderRecord(fd, holder);

    let ended: ChildEnd | undefined;
    const spawnChild: GuardedSpawn = (command, args, options) => {
      const child: ChildProcess = deps.spawn(command, args, {
        ...options,
        cwd: request.cwd,
        env: {
          ...definedEntries(deps.environment),
          [LOCK_ENV.FD]: CHILD_DESCRIPTOR_ENV_VALUE,
          [LOCK_ENV.FILE_ID]: fileId,
        },
      }) as ChildProcess;
      child.once("exit", (code, signal) => {
        ended = { code, signal };
      });
      if (child.pid !== undefined) fs.writeHolderRecord(fd, { ...holder, childProcessGroup: child.pid });
      return child;
    };

    const [executable, ...args] = request.command;
    handedToChild = true;
    const status = await deps.createSupervisor(spawnChild).run({ command: executable, args, descriptor: fd })
      .catch(() => undefined);
    if (status === undefined) return report({ kind: OUTCOME_KIND.SPAWN_FAILED });
    return ended?.signal
      ? report({ kind: OUTCOME_KIND.SIGNALED, signal: ended.signal })
      : report({ kind: OUTCOME_KIND.EXITED, code: ended?.code ?? status });
  } finally {
    if (!handedToChild) fs.close(fd);
  }
}

/**
 * Samples load until a window admits the command. A sample that exceeds a limit or is invalid is
 * discarded with its window; a gap longer than the limit starts a fresh window at the late sample.
 * Resolves false when the wait cap expires first, including immediately before the spawn.
 */
async function admitAfterQuietWindow(deps: HostCommandLockDeps, capExpired: () => boolean): Promise<boolean> {
  const { loadSource } = deps;
  let window: LoadSample[] = [];
  for (;;) {
    if (capExpired()) return false;
    const sample = loadSource.sample();
    if (!sampleIsValid(sample) || sampleExceedsLimit(sample, loadSource.cpuCount)) {
      window = [];
    } else {
      window = window.length > 0 && gapExceedsLimit(window[window.length - 1], sample) ? [sample] : [...window, sample];
    }
    if (windowAdmits(window, loadSource.cpuCount)) return !capExpired();
    if (windowHasEnoughSamples(window)) window = window.slice(1);
    await deps.sleep(LOAD_WINDOW.SAMPLE_INTERVAL_MS);
  }
}
