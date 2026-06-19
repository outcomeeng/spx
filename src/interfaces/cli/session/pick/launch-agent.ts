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

/** Status the descriptor exits with when the agent never reports its own. */
const LAUNCH_FAILURE_STATUS = 1;

/**
 * Spawns `command` with inherited stdio through `runner` and resolves with the
 * child's exit code. Resolves a non-zero status when the child exits without
 * one (e.g. on a signal) and when the agent binary cannot be spawned — the
 * `error` event a missing or non-executable binary emits in place of `exit` —
 * so the descriptor always exits with a defined status rather than hanging on
 * an unresolved promise or crashing on an unhandled spawn error.
 */
export function launchAgent(runner: ProcessRunner, command: LaunchCommand): Promise<number> {
  return new Promise((resolve) => {
    const child = runner.spawn(command.command, command.args, { stdio: "inherit" });
    child.once("exit", (code) => resolve(code ?? LAUNCH_FAILURE_STATUS));
    child.once("error", () => resolve(LAUNCH_FAILURE_STATUS));
  });
}
