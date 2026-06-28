import type { AgentResumeLaunchCommand } from "@/domains/agent";
import { launchForegroundCommand } from "@/interfaces/cli/foreground-launch";
import type { ProcessRunner, SignalSuspender } from "@/lib/process-lifecycle";

export function launchAgentResume(
  runner: ProcessRunner,
  suspender: SignalSuspender,
  command: AgentResumeLaunchCommand,
): Promise<number> {
  return launchForegroundCommand(runner, suspender, command);
}
