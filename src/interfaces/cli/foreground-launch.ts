import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

export interface ForegroundLaunchCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
}

export const FOREGROUND_LAUNCH_STDIO = "inherit";

const LAUNCH_FAILURE_STATUS = 1;

export function launchForegroundCommand(
  runner: ProcessRunner,
  suspender: SignalSuspender,
  command: ForegroundLaunchCommand,
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
      stdio: FOREGROUND_LAUNCH_STDIO,
    });
    child.once("exit", (code) => settle(code ?? LAUNCH_FAILURE_STATUS));
    child.once("error", () => settle(LAUNCH_FAILURE_STATUS));
  });
}
