/**
 * Mounts the interactive session picker and resolves to the chosen session.
 *
 * This is the terminal-rendering concern of the CLI-interface layer per
 * `spx/13-cli.enabler/21-terminal-ui.adr.md`: it drives Ink's render loop and
 * Ink owns terminal restoration (on unmount and on the process `exit` event).
 * It resolves to the session the operator claimed, or `null` when they cancel;
 * the descriptor owns the surrounding process I/O — the TTY gate, the claim
 * through `pickupCommand`, and the exit code.
 *
 * @module interfaces/cli/session/pick/run-picker
 */

import { render } from "ink";

import type { Session } from "@/domains/session/types";

import { SessionPicker } from "./SessionPicker";

/** Diagnostic the descriptor emits when the picker cannot run without a TTY. */
export const PICK_NON_TTY_MESSAGE =
  "session pick requires an interactive terminal. Use `spx session pickup --auto` or `spx session pickup <id>` in a non-interactive context.";

/**
 * Renders the picker over the candidate sessions and resolves once the operator
 * claims a session or cancels.
 *
 * @param sessions - The claimable candidate sessions to display
 * @returns The session the operator claimed, or `null` if they cancelled
 */
export async function runPicker(sessions: readonly Session[]): Promise<Session | null> {
  let claimed: Session | null = null;
  let unmount = (): void => {};

  const instance = render(
    <SessionPicker
      sessions={sessions}
      onClaim={(session) => {
        claimed = session;
        unmount();
      }}
      onCancel={() => {
        unmount();
      }}
    />,
  );
  unmount = instance.unmount;

  await instance.waitUntilExit();
  return claimed;
}
