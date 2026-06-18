/**
 * Shared worktree-occupancy claim service.
 *
 * @module domains/worktree/claim
 */

import type { Result } from "@/config/types";
import { type ControllingProcessEnv, resolveControllingProcess } from "@/domains/worktree/controlling-process";
import { type OccupancyFileSystem, writeClaim } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";

import { resolveCurrentWorktreeName, resolveWorktreesDir, type WorktreeScopeOptions } from "./resolve";

export interface ClaimWorktreeOccupancyOptions extends WorktreeScopeOptions {
  /** The claiming agent's session id. */
  readonly sessionId: string;
  /** Writer-unique token used for the atomic claim temp path. */
  readonly claimWriteToken: string;
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
  return writeClaim(
    worktreesDir,
    name,
    {
      sessionId: options.sessionId,
      host: controlling.value.host,
      pid: controlling.value.pid,
      startedAt: controlling.value.startedAt,
    },
    { fs: options.fs, writeToken: options.claimWriteToken },
  );
}
