/**
 * Mounts the interactive session picker and resolves to the operator's launch choice.
 *
 * As the CLI-interface layer's terminal-rendering concern, it drives Ink's
 * render loop; Ink owns terminal restoration (on unmount and on the process
 * `exit` event). It resolves to the chosen `{session, runtime, autoContinue}`,
 * or `null` when the operator quits — the descriptor then resolves the agent
 * command and hands the terminal to it. The picker performs no claim.
 *
 * @module interfaces/cli/session/pick/run-picker
 */

import { render } from "ink";

import type { PickerRuntime } from "@/domains/session/pick-model";
import type { Session } from "@/domains/session/types";

import { SessionPicker } from "./SessionPicker";

/** Diagnostic the descriptor emits when the picker cannot run without a TTY. */
export const PICK_NON_TTY_MESSAGE =
  "session pick requires an interactive terminal. Run `claude \"/pickup <id>\"` or `codex \"$pickup <id>\"` directly in a non-interactive context.";

/** The session the operator chose to resume and how to resume it. */
export interface LaunchChoice {
  readonly session: Session;
  readonly runtime: PickerRuntime;
  readonly autoContinue: boolean;
}

/**
 * Renders the picker over the candidate sessions and resolves once the operator
 * launches a session or quits.
 *
 * @param sessions - The claimable candidate sessions to display
 * @returns The launch choice, or `null` if the operator quit
 */
export async function runPicker(sessions: readonly Session[]): Promise<LaunchChoice | null> {
  let choice: LaunchChoice | null = null;
  let unmount = (): void => {};

  const instance = render(
    <SessionPicker
      sessions={sessions}
      onLaunch={(session, runtime, autoContinue) => {
        choice = { session, runtime, autoContinue };
        unmount();
      }}
      onQuit={() => {
        unmount();
      }}
    />,
  );
  unmount = instance.unmount;

  await instance.waitUntilExit();
  return choice;
}
