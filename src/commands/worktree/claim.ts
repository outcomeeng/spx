/**
 * `spx worktree claim` handler — records a worktree-occupancy claim for the
 * running worktree keyed on its controlling agent process.
 *
 * @module commands/worktree/claim
 */

import type { Result } from "@/config/types";
import { type ControllingProcessEnv, resolveControllingProcess } from "@/domains/worktree/controlling-process";
import { type OccupancyFileSystem, writeClaim } from "@/domains/worktree/occupancy-store";
import { defaultProcessTable, type ProcessTable } from "@/domains/worktree/process-table";

import { resolveCurrentWorktreeName, resolveWorktreesDir, type WorktreeScopeOptions } from "./resolve";

export interface ClaimCommandOptions extends WorktreeScopeOptions {
  /** The claiming agent's session id. */
  readonly sessionId: string;
  /** Environment read for the controlling-pid override. Defaults to `process.env`. */
  readonly env?: ControllingProcessEnv;
  /** Injected process table. Defaults to the real process table. */
  readonly processTable?: ProcessTable;
  /** spx's own pid, the ancestry walk starts above. Defaults to `process.pid`. */
  readonly selfPid?: number;
  /** Injected claim filesystem. */
  readonly fs?: OccupancyFileSystem;
}

/** Records a claim for the running worktree; returns the written claim path. */
export async function claimCommand(options: ClaimCommandOptions): Promise<Result<string>> {
  const table = options.processTable ?? defaultProcessTable;
  const controlling = resolveControllingProcess(options.selfPid ?? process.pid, table, options.env ?? process.env);
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
    { fs: options.fs },
  );
}
