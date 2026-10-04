/**
 * Spawn-fixture harness. Encapsulates the spawn / optional stdout-destroy /
 * exit-capture pattern used by lifecycle EPIPE evidence, so tests do not own
 * Node API event names or encoding tokens directly.
 *
 * The harness spawns a command, captures stderr to a string, optionally
 * destroys the parent's read end of stdout after a delay or observed marker,
 * and resolves with the child's exit code (translated from signals via the
 * POSIX `128 + signal` convention).
 */

import { type ChildProcess, spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import { join } from "node:path";

import { PRODUCT_ROOT } from "@testing/harnesses/constants";

const STDERR_ENCODING = "utf8";
const EPIPE_EMITTER_FIXTURE_PATH = join(PRODUCT_ROOT, "testing", "fixtures", "cli", "epipe-emitter.ts");
const EPIPE_EMITTER_LAUNCHER = "npx";
const EPIPE_EMITTER_LAUNCHER_ARGS = ["tsx", EPIPE_EMITTER_FIXTURE_PATH] as const;
/** Long enough for the emitter to fill the OS pipe buffer before the parent closes its read end. */
const EPIPE_EMITTER_STDOUT_FILL_MS = 200;
const SIGNAL_NUMBERS: Readonly<Partial<Record<string, number>>> = osConstants.signals;

export const SPAWN_FIXTURE_SIGNAL_BASE_EXIT_CODE = 128;
export const SPAWN_FIXTURE_UNKNOWN_EXIT_CODE = -1;
export const SPAWN_FIXTURE_STREAM_EVENTS = {
  CLOSE: "close",
  DATA: "data",
  ERROR: "error",
  EXIT: "exit",
} as const;

interface SpawnFixtureBaseOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

interface SpawnFixtureWithoutStdoutClosure extends SpawnFixtureBaseOptions {
  readonly destroyStdoutAfterMs?: never;
  readonly destroyStdoutAfterMarker?: never;
}

interface SpawnFixtureWithDelayedStdoutClosure extends SpawnFixtureBaseOptions {
  readonly destroyStdoutAfterMs: number;
  readonly destroyStdoutAfterMarker?: never;
}

interface SpawnFixtureWithMarkerStdoutClosure extends SpawnFixtureBaseOptions {
  readonly destroyStdoutAfterMs?: never;
  readonly destroyStdoutAfterMarker: string;
}

export type SpawnFixtureOptions =
  | SpawnFixtureWithoutStdoutClosure
  | SpawnFixtureWithDelayedStdoutClosure
  | SpawnFixtureWithMarkerStdoutClosure;

export interface SpawnFixtureResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdoutBytesObserved: number;
  readonly stdoutMarkerObserved: boolean;
}

export function resolveSpawnFixtureExitCode(code: number | null, signal: string | null): number {
  if (signal === null) {
    return code ?? SPAWN_FIXTURE_UNKNOWN_EXIT_CODE;
  }

  const signalNumber = SIGNAL_NUMBERS[signal];
  return signalNumber === undefined
    ? SPAWN_FIXTURE_UNKNOWN_EXIT_CODE
    : SPAWN_FIXTURE_SIGNAL_BASE_EXIT_CODE + signalNumber;
}

export async function runSpawnFixture(options: SpawnFixtureOptions): Promise<SpawnFixtureResult> {
  const child = spawn(options.command, [...options.args], { cwd: options.cwd });
  const stdoutMarker = options.destroyStdoutAfterMarker === undefined
    ? undefined
    : Buffer.from(options.destroyStdoutAfterMarker);

  let stderr = "";
  let stdoutBytesObserved = 0;
  let stdoutMarkerObserved = false;
  let stdoutMarkerProbe = Buffer.alloc(0);
  let stdoutDestroyTimer: NodeJS.Timeout | undefined;

  child.stderr.on(SPAWN_FIXTURE_STREAM_EVENTS.DATA, (chunk: Buffer) => {
    stderr += chunk.toString(STDERR_ENCODING);
  });

  child.stdout.on(SPAWN_FIXTURE_STREAM_EVENTS.DATA, (chunk: Buffer) => {
    stdoutBytesObserved += chunk.length;
    if (stdoutMarker === undefined || stdoutMarkerObserved) {
      return;
    }

    stdoutMarkerProbe = Buffer.concat([stdoutMarkerProbe, chunk]);
    if (stdoutMarkerProbe.indexOf(stdoutMarker) >= 0) {
      stdoutMarkerObserved = true;
      child.stdout.destroy();
      return;
    }

    const retainedByteCount = Math.max(0, stdoutMarker.length - 1);
    stdoutMarkerProbe = stdoutMarkerProbe.subarray(
      Math.max(0, stdoutMarkerProbe.length - retainedByteCount),
    );
  });

  if (options.destroyStdoutAfterMs !== undefined) {
    stdoutDestroyTimer = setTimeout(() => {
      child.stdout.destroy();
    }, options.destroyStdoutAfterMs);
  }

  const exitCode = await waitForClose(child).finally(() => {
    if (stdoutDestroyTimer !== undefined) {
      clearTimeout(stdoutDestroyTimer);
    }
  });

  return { exitCode, stderr, stdoutBytesObserved, stdoutMarkerObserved };
}

function waitForClose(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve) => {
    let settled = false;

    const settle = (exitCode: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.removeListener(SPAWN_FIXTURE_STREAM_EVENTS.CLOSE, handleClose);
      child.removeListener(SPAWN_FIXTURE_STREAM_EVENTS.ERROR, handleError);
      resolve(exitCode);
    };

    const handleClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      settle(resolveSpawnFixtureExitCode(code, signal));
    };

    const handleError = (): void => {
      settle(SPAWN_FIXTURE_UNKNOWN_EXIT_CODE);
    };

    child.on(SPAWN_FIXTURE_STREAM_EVENTS.CLOSE, handleClose);
    child.on(SPAWN_FIXTURE_STREAM_EVENTS.ERROR, handleError);
  });
}

/**
 * Runs the EPIPE emitter fixture — a process that installs the lifecycle handlers and writes to
 * stdout without end — from the product root, lets it fill the pipe, then destroys the parent's
 * read end so the emitter's next write raises EPIPE.
 */
export async function runEpipeEmitterFixture(): Promise<SpawnFixtureResult> {
  return runSpawnFixture({
    command: EPIPE_EMITTER_LAUNCHER,
    args: EPIPE_EMITTER_LAUNCHER_ARGS,
    cwd: PRODUCT_ROOT,
    destroyStdoutAfterMs: EPIPE_EMITTER_STDOUT_FILL_MS,
  });
}
