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
import { constants as osConstants } from "node:os";

const STDOUT_DATA_EVENT = "data";
const STDERR_DATA_EVENT = "data";
const CHILD_CLOSE_EVENT = "close";
const STDERR_ENCODING = "utf8";
const UNKNOWN_EXIT_CODE = -1;
const SIGNAL_NUMBERS: Readonly<Partial<Record<string, number>>> = osConstants.signals;

export const SPAWN_FIXTURE_SIGNAL_BASE_EXIT_CODE = 128;

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

  const exitCode = await waitForClose(child);

  return { exitCode, stderr, stdoutBytesObserved };
}

function waitForClose(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve) => {
    child.on(CHILD_CLOSE_EVENT, (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal !== null) {
        const signalNumber = SIGNAL_NUMBERS[signal];
        resolve(signalNumber === undefined ? UNKNOWN_EXIT_CODE : SPAWN_FIXTURE_SIGNAL_BASE_EXIT_CODE + signalNumber);
        return;
      }
      resolve(code ?? UNKNOWN_EXIT_CODE);
    });
  });
}
