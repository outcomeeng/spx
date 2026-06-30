/**
 * Shared worktree-occupancy claim service.
 *
 * @module domains/worktree/claim
 */

import type { Result } from "@/config/types";
import { normalizeAgentSessionToken } from "@/domains/session/agent-session";
import { type ControllingProcessEnv, resolveControllingProcess } from "@/domains/worktree/controlling-process";
import { acquireClaim, type OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import type { RandomBytes } from "@/lib/atomic-file-write";

import { resolveCurrentWorktreeName, resolveWorktreesDir, type WorktreeScopeOptions } from "./resolve";

export interface ClaimWorktreeOccupancyOptions extends WorktreeScopeOptions {
  /** The claiming agent's session id. */
  readonly sessionId: string;
  /** Random bytes source used for the atomic claim temp path. */
  readonly claimRandomBytes: RandomBytes;
  /** Environment read for the controlling-pid override. */
  readonly env: ControllingProcessEnv;
  /** Injected process table. */
  readonly processTable: ProcessTable;
  /** spx's own pid, the ancestry walk starts above. */
  readonly selfPid: number;
  /** Injected claim filesystem. */
  readonly fs: OccupancyFileSystem;
}

/** Records a claim for the running worktree; returns the written claim path. */
export async function claimWorktreeOccupancy(options: ClaimWorktreeOccupancyOptions): Promise<Result<string>> {
  const controlling = resolveControllingProcess(options.selfPid, options.processTable, options.env);
  if (!controlling.ok) return controlling;

  const worktreesDir = await resolveWorktreesDir(options);
  const name = await resolveCurrentWorktreeName(options);
  return acquireClaim(
    worktreesDir,
    name,
    {
      sessionId: normalizeAgentSessionToken(options.sessionId),
      host: controlling.value.host,
      pid: controlling.value.pid,
      startedAt: controlling.value.startedAt,
    },
    options.processTable,
    { fs: options.fs, randomBytes: options.claimRandomBytes },
  );
}
