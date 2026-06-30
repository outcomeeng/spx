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
const CHILD_ERROR_EVENT = "error";
const STDERR_ENCODING = "utf8";
const SIGNAL_NUMBERS: Readonly<Partial<Record<string, number>>> = osConstants.signals;

export const SPAWN_FIXTURE_SIGNAL_BASE_EXIT_CODE = 128;
export const SPAWN_FIXTURE_UNKNOWN_EXIT_CODE = -1;

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
  let stdoutDestroyTimer: NodeJS.Timeout | undefined;

  child.stderr.on(STDERR_DATA_EVENT, (chunk: Buffer) => {
    stderr += chunk.toString(STDERR_ENCODING);
  });

  child.stdout.on(STDOUT_DATA_EVENT, (chunk: Buffer) => {
    stdoutBytesObserved += chunk.length;
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

  return { exitCode, stderr, stdoutBytesObserved };
}

function waitForClose(child: ChildProcess): Promise<number> {
  return new Promise<number>((resolve) => {
    let settled = false;

    const settle = (exitCode: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.removeListener(CHILD_CLOSE_EVENT, handleClose);
      child.removeListener(CHILD_ERROR_EVENT, handleError);
      resolve(exitCode);
    };

    const handleClose = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (signal !== null) {
        const signalNumber = SIGNAL_NUMBERS[signal];
        settle(
          signalNumber === undefined
            ? SPAWN_FIXTURE_UNKNOWN_EXIT_CODE
            : SPAWN_FIXTURE_SIGNAL_BASE_EXIT_CODE + signalNumber,
        );
        return;
      }
      settle(code ?? SPAWN_FIXTURE_UNKNOWN_EXIT_CODE);
    };

    const handleError = (): void => {
      settle(SPAWN_FIXTURE_UNKNOWN_EXIT_CODE);
    };

    child.on(CHILD_CLOSE_EVENT, handleClose);
    child.on(CHILD_ERROR_EVENT, handleError);
  });
}
