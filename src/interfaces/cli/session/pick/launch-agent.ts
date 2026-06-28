/**
 * Hands the terminal to the resolved agent command.
 *
 * Spawns the foreground child with inherited standard streams through the
 * injected non-registering `ProcessRunner`, so the agent (`claude`/`codex`)
 * owns the terminal, and resolves with the child's exit code for the descriptor
 * to exit on. Unlike the piped managed-subprocess helper, which drains a
 * background child, this foreground handoff is not drained or tracked — the
 * child succeeds the parent. Because the agent owns the terminal, the parent's
 * SIGINT and SIGTERM handling is suspended for the child's lifetime through the
 * injected suspender, so a Ctrl-C reaches the agent rather than killing it
 * through the parent's signal cleanup or preempting the exit.
 *
 * @module interfaces/cli/session/pick/launch-agent
 */

import type { LaunchCommand } from "@/domains/session/pick-model";
import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

/** Status the descriptor exits with when the agent never reports its own. */
const LAUNCH_FAILURE_STATUS = 1;

/**
 * Suspends the parent's foreground-signal handling, spawns `command` with
 * inherited stdio through `runner`, and resolves with the child's exit code,
 * restoring the parent's signal handling first. Resolves a non-zero status
 * when the child exits without one (e.g. on a signal) and when the agent binary
 * cannot be spawned — the `error` event a missing or non-executable binary
 * emits in place of `exit` — so the descriptor always exits with a defined
 * status rather than hanging on an unresolved promise or crashing on an
 * unhandled spawn error.
 */
export function launchAgent(
  runner: ProcessRunner,
  suspender: SignalSuspender,
  command: LaunchCommand,
): Promise<number> {
  const restoreSignals = suspender.suspend();
  return new Promise((resolve) => {
    // `exit` and `error` are mutually exclusive in practice, but Node warns a
    // child may emit both; the guard keeps the non-idempotent signal restore
    // from running twice and duplicating the parent's listeners.
    let settled = false;
    const settle = (status: number): void => {
      if (settled) return;
      settled = true;
      restoreSignals();
      resolve(status);
    };
    const child = runner.spawn(command.command, command.args, {
      stdio: "inherit",
    });
    child.once("exit", (code) => settle(code ?? LAUNCH_FAILURE_STATUS));
    child.once("error", () => settle(LAUNCH_FAILURE_STATUS));
  });
}
