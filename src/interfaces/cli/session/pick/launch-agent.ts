import type { LaunchCommand } from "@/domains/session/pick-model";
import { launchForegroundCommand } from "@/interfaces/cli/foreground-launch";
import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

export function launchAgent(
  runner: ProcessRunner,
  suspender: SignalSuspender,
  command: LaunchCommand,
): Promise<number> {
  return launchForegroundCommand(runner, suspender, command);
}
