/**
 * Hands the terminal to the resolved agent command.
 *
 * Spawns the foreground child with inherited standard streams through the
 * injected `ProcessRunner`, so the agent (`claude`/`codex`) owns the terminal,
 * and resolves with the child's exit code for the descriptor to exit on. This
 * is the interactive exec-handoff of `spx/13-cli.enabler/21-terminal-ui.adr.md`
 * — distinct from the piped managed-subprocess helper for background children.
 *
 * @module interfaces/cli/session/pick/launch-agent
 */

import type { LaunchCommand } from "@/domains/session/pick-model";
import type { ProcessRunner } from "@/lib/process-lifecycle/types";

/**
 * Spawns `command` with inherited stdio through `runner` and resolves with the
 * child's exit code (1 when it exits without one, e.g. on a signal).
 */
export function launchAgent(runner: ProcessRunner, command: LaunchCommand): Promise<number> {
  return new Promise((resolve) => {
    const child = runner.spawn(command.command, command.args, { stdio: "inherit" });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
