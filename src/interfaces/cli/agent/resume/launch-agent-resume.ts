/**
 * Hands the terminal to an agent resume command from the recorded session cwd.
 *
 * @module interfaces/cli/agent/resume/launch-agent-resume
 */

import type { AgentResumeLaunchCommand } from "@/domains/agent";
import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

/** Status the descriptor exits with when the agent never reports its own. */
const LAUNCH_FAILURE_STATUS = 1;

/**
 * Suspends the parent's foreground-signal handling, spawns `command` with
 * inherited stdio from the session cwd through `runner`, and resolves with the
 * child's exit code after restoring the parent's signal handling.
 */
export function launchAgentResume(
  runner: ProcessRunner,
  suspender: SignalSuspender,
  command: AgentResumeLaunchCommand,
): Promise<number> {
  const restoreSignals = suspender.suspend();
  return new Promise((resolve) => {
    let settled = false;
    const settle = (status: number): void => {
      if (settled) return;
      settled = true;
      restoreSignals();
      resolve(status);
    };
    const child = runner.spawn(command.command, command.args, {
      cwd: command.cwd,
      stdio: "inherit",
    });
    child.once("exit", (code) => settle(code ?? LAUNCH_FAILURE_STATUS));
    child.once("error", () => settle(LAUNCH_FAILURE_STATUS));
  });
}
