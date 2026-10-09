/**
 * `spx worktree release` handler — removes the running worktree's claim.
 *
 * @module commands/worktree/release
 */

import type { Result } from "@/config/types";
import { nonEmptyEnvValue, normalizeAgentSessionToken, resolveAgentSessionId } from "@/domains/session/agent-session";
import { type ControllingProcessEnv, resolveControllingProcess } from "@/domains/worktree/controlling-process";
import {
  createClaimOperationRecord,
  type OccupancyFileSystem,
  removeClaim,
  removeClaimBySessionId,
} from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import { resolveCurrentWorktreeName, resolveWorktreesDir, type WorktreeScopeOptions } from "@/domains/worktree/resolve";
import { authoredText, type TerminalText } from "@/lib/terminal-text/terminal-text";

export const WORKTREE_RELEASE_ERROR = {
  SESSION_UNRESOLVED: "worktree release session id could not be resolved",
} as const;

export interface ReleaseCommandOptions extends WorktreeScopeOptions {
  /** Explicit releasing agent session id. */
  readonly sessionId?: string;
  /** Environment read for session identity and controlling-pid override. */
  readonly env: ControllingProcessEnv;
  /** Injected process table. */
  readonly processTable: ProcessTable;
  /** spx's own pid, the ancestry walk starts above. */
  readonly selfPid: number;
  /** Injected claim filesystem. */
  readonly fs: OccupancyFileSystem;
}

/**
 * Removes the running worktree's claim. Idempotent — a missing claim is success.
 * An explicit session id is release authority of its own: the claim recording that
 * session id is removed without resolving a controlling process. A session id
 * resolved from the environment keeps the full holder match.
 */
export async function releaseCommand(options: ReleaseCommandOptions): Promise<Result<void, TerminalText>> {
  const explicitSessionId = nonEmptyEnvValue(options.sessionId);
  const sessionId = resolveReleaseSessionId(explicitSessionId, options.env);
  if (sessionId === undefined) return { ok: false, error: authoredText(WORKTREE_RELEASE_ERROR.SESSION_UNRESOLVED) };

  const worktreesDir = await resolveWorktreesDir(options);
  const name = await resolveCurrentWorktreeName(options);
  const mutation = {
    fs: options.fs,
    operation: createClaimOperationRecord(sessionId, options.selfPid, options.processTable),
  };

  if (explicitSessionId !== undefined) {
    return removeClaimBySessionId(worktreesDir, name, sessionId, options.processTable, mutation);
  }

  const controlling = resolveControllingProcess(options.selfPid, options.processTable, options.env);
  if (!controlling.ok) return controlling;
  return removeClaim(
    worktreesDir,
    name,
    {
      sessionId,
      host: controlling.value.host,
      pid: controlling.value.pid,
      startedAt: controlling.value.startedAt,
    },
    options.processTable,
    mutation,
  );
}

function resolveReleaseSessionId(
  explicitSessionId: string | undefined,
  env: ControllingProcessEnv,
): string | undefined {
  return explicitSessionId === undefined
    ? resolveAgentSessionId(env)
    : normalizeAgentSessionToken(explicitSessionId);
}
