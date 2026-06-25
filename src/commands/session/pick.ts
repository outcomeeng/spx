/**
 * Session pick CLI command handler.
 *
 * Loads the claimable candidate set for the interactive launcher. As a handler,
 * it resolves config and reads the session store, performing no Commander
 * binding and no process I/O — the descriptor mounts the terminal interface and
 * hands the chosen session to the launched agent.
 *
 * @module commands/session/pick
 */

import type { Session } from "@/domains/session/types";
import { loadTodoSessions } from "./pickup";
import { resolveSessionConfigSurfacingWarning, type SessionWarningHandler } from "./resolve-config";

/**
 * Options for loading picker candidates.
 */
export interface PickCandidatesOptions {
  /** Custom sessions directory. */
  sessionsDir?: string;
  /** Current working directory for default session-store resolution. */
  cwd?: string;
  /** Receives the non-git-repo diagnostic for the descriptor to surface. */
  onWarning?: SessionWarningHandler;
}

/**
 * Loads the claimable sessions the picker offers — the `todo` queue, the same
 * source `spx session pickup` claims from. The picker orders and filters this
 * pool through its own model (`buildCandidates`); this loader only reads it.
 *
 * @param options - Resolution options
 * @returns The claimable `todo` sessions
 */
export async function loadPickCandidates(options: PickCandidatesOptions): Promise<Session[]> {
  const config = await resolveSessionConfigSurfacingWarning(options.sessionsDir, options.onWarning, options.cwd);
  return loadTodoSessions(config);
}
