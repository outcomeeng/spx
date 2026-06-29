/**
 * `spx worktree release` handler — removes the running worktree's claim.
 *
 * @module commands/worktree/release
 */

import type { Result } from "@/config/types";
import { normalizeAgentSessionToken, resolveAgentSessionId } from "@/domains/session/agent-session";
import { type ControllingProcessEnv, resolveControllingProcess } from "@/domains/worktree/controlling-process";
import { type OccupancyFileSystem, removeClaim } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import { resolveCurrentWorktreeName, resolveWorktreesDir, type WorktreeScopeOptions } from "@/domains/worktree/resolve";

const WORKTREE_RELEASE_ERROR = {
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

/** Removes the running worktree's claim. Idempotent — a missing claim is success. */
export async function releaseCommand(options: ReleaseCommandOptions): Promise<Result<void>> {
  const sessionId = resolveReleaseSessionId(options.sessionId, options.env);
  if (sessionId === undefined) return { ok: false, error: WORKTREE_RELEASE_ERROR.SESSION_UNRESOLVED };
  const controlling = resolveControllingProcess(options.selfPid, options.processTable, options.env);
  if (!controlling.ok) return controlling;

  const worktreesDir = await resolveWorktreesDir(options);
  const name = await resolveCurrentWorktreeName(options);
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
    { fs: options.fs },
  );
}

function resolveReleaseSessionId(
  explicitSessionId: string | undefined,
  env: ControllingProcessEnv,
): string | undefined {
  const explicit = nonEmptyString(explicitSessionId);
  return explicit === undefined ? resolveAgentSessionId(env) : normalizeAgentSessionToken(explicit);
}

function nonEmptyString(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}
