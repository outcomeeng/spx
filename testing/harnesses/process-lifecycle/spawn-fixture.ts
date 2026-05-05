/**
 * L2 spawn-fixture harness. Encapsulates the spawn / optional stdout-destroy /
 * exit-capture pattern used by the lifecycle EPIPE smoke test, so tests do not
 * own Node API event names or encoding tokens directly.
 *
 * The harness spawns a command, captures stderr to a string, optionally
 * destroys the parent's read end of stdout after a configurable delay, and
 * resolves with the child's exit code (translated from signals via the POSIX
 * `128 + signal` convention).
 */

import { type ChildProcess, spawn } from "node:child_process";

const STDOUT_DATA_EVENT = "data";
const STDERR_DATA_EVENT = "data";
const CHILD_EXIT_EVENT = "exit";
const STDERR_ENCODING = "utf8";
const SIGNAL_BASE_EXIT_CODE = 128;
const UNKNOWN_EXIT_CODE = -1;

const SIGNAL_NUMBERS: Readonly<Record<string, number>> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGTERM: 15,
  SIGPIPE: 13,
};

export interface SpawnFixtureOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly destroyStdoutAfterMs?: number;
}

export interface SpawnFixtureResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdoutBytesObserved: number;
}

export async function runSpawnFixture(options: SpawnFixtureOptions): Promise<SpawnFixtureResult> {
  const child = spawn(options.command, [...options.args], { cwd: options.cwd });

  let stderr = "";
  let stdoutBytesObserved = 0;

  child.stderr.on(STDERR_DATA_EVENT, (chunk: Buffer) => {
    stderr += chunk.toString(STDERR_ENCODING);
  });

  child.stdout.on(STDOUT_DATA_EVENT, (chunk: Buffer) => {
    stdoutBytesObserved += chunk.length;
  });

  if (options.destroyStdoutAfterMs !== undefined) {
    setTimeout(() => {
      child.stdout.destroy();
    }, options.destroyStdoutAfterMs);
  }

  const exitCode = await waitForExit(child);

  return { exitCode, stderr, stdoutBytesObserved };
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve) => {
    child.on(CHILD_EXIT_EVENT, (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal !== null) {
        const signalNumber = SIGNAL_NUMBERS[signal];
        resolve(signalNumber === undefined ? UNKNOWN_EXIT_CODE : SIGNAL_BASE_EXIT_CODE + signalNumber);
        return;
      }
      resolve(code ?? UNKNOWN_EXIT_CODE);
    });
  });
}
