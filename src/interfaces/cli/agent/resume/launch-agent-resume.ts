import type { AgentResumeLaunchCommand } from "@/domains/agent";
import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

/** Status the descriptor exits with when the agent never reports its own. */
const LAUNCH_FAILURE_STATUS = 1;

export function launchAgentResume(
  runner: ProcessRunner,
  suspender: SignalSuspender,
  command: AgentResumeLaunchCommand,
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
      cwd: command.cwd,
      stdio: "inherit",
    });
    child.once("exit", (code) => settle(code ?? LAUNCH_FAILURE_STATUS));
    child.once("error", () => settle(LAUNCH_FAILURE_STATUS));
  });
}
