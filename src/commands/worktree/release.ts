/**
 * `spx worktree release` handler — removes the running worktree's claim.
 *
 * @module commands/worktree/release
 */

import type { Result } from "@/config/types";
import { type OccupancyFileSystem, removeClaim } from "@/domains/worktree/occupancy-store";

import { resolveCurrentWorktreeName, resolveWorktreesDir, type WorktreeScopeOptions } from "./resolve";

export interface ReleaseCommandOptions extends WorktreeScopeOptions {
  /** Injected claim filesystem. */
  readonly fs?: OccupancyFileSystem;
}

/** Removes the running worktree's claim. Idempotent — a missing claim is success. */
export async function releaseCommand(options: ReleaseCommandOptions): Promise<Result<void>> {
  const worktreesDir = await resolveWorktreesDir(options);
  const name = await resolveCurrentWorktreeName(options);
  return removeClaim(worktreesDir, name, { fs: options.fs });
}
