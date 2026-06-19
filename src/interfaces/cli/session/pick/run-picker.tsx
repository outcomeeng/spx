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
import type { ReactElement } from "react";

import type { PickerRuntime } from "@/domains/session/pick-model";
import type { Session } from "@/domains/session/types";

import { SessionPicker } from "./SessionPicker";

/** The subset of Ink's render result that `runPicker` drives. */
export interface PickerInstance {
  unmount(): void;
  waitUntilExit(): Promise<unknown>;
}

/** Mounts the picker element to a {@link PickerInstance} — Ink's `render` in production. */
export type PickerRenderer = (element: ReactElement) => PickerInstance;

/**
 * Diagnostic the descriptor emits when the picker cannot run without a TTY.
 * The suggested commands are single-quoted so a shell does not expand `$pickup`
 * (codex's skill prefix is `$`) before the agent receives the prompt.
 */
export const PICK_NON_TTY_MESSAGE =
  "session pick requires an interactive terminal. Run `claude '/pickup <id>'` or `codex '$pickup <id>'` directly in a non-interactive context.";

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
 * @param renderPicker - Mounts the element; defaults to Ink's `render`, injected in tests
 * @returns The launch choice, or `null` if the operator quit
 */
export async function runPicker(
  sessions: readonly Session[],
  renderPicker: PickerRenderer = render,
): Promise<LaunchChoice | null> {
  let choice: LaunchChoice | null = null;
  let unmount = (): void => {};

  const instance = renderPicker(
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
