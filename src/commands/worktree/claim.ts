/**
 * `spx worktree claim` handler — records a worktree-occupancy claim for the
 * running worktree keyed on its controlling agent process.
 *
 * @module commands/worktree/claim
 */

import type { Result } from "@/config/types";
import { claimWorktreeOccupancy } from "@/domains/worktree/claim";
import type { ControllingProcessEnv } from "@/domains/worktree/controlling-process";
import type { OccupancyFileSystem } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import type { WorktreeScopeOptions } from "@/domains/worktree/resolve";
import type { RandomBytes } from "@/lib/atomic-file-write";

export interface ClaimCommandOptions extends WorktreeScopeOptions {
  /** The claiming agent's session id. */
  readonly sessionId: string;
  /** Source of cryptographic random bytes for the atomic claim temp path. */
  readonly randomBytes: RandomBytes;
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
export async function claimCommand(options: ClaimCommandOptions): Promise<Result<string>> {
  return claimWorktreeOccupancy(options);
}
