/**
 * `spx worktree status` handler — reports a worktree's occupancy as a rendered
 * line (text or machine-parseable JSON).
 *
 * @module commands/worktree/status
 */

import type { Result } from "@/config/types";
import { type OccupancyFileSystem, type OccupancyStatus, readOccupancy } from "@/domains/worktree/occupancy-store";
import { defaultProcessTable, type ProcessTable } from "@/domains/worktree/process-table";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";

import { resolveWorktreesDir, type WorktreeScopeOptions } from "./resolve";

export const WORKTREE_STATUS_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export type WorktreeStatusFormat = (typeof WORKTREE_STATUS_FORMAT)[keyof typeof WORKTREE_STATUS_FORMAT];

export interface StatusCommandOptions extends WorktreeScopeOptions {
  /** The worktree to query — a path or bare name; its basename keys the claim. */
  readonly worktree: string;
  /** Output format; defaults to text. */
  readonly format?: string;
  /** Injected process table. Defaults to the real process table. */
  readonly processTable?: ProcessTable;
  /** Injected claim filesystem. */
  readonly fs?: OccupancyFileSystem;
}

/** Reads the worktree's occupancy and renders it in the requested format. */
export async function statusCommand(options: StatusCommandOptions): Promise<Result<string>> {
  const worktreesDir = await resolveWorktreesDir(options);
  const name = worktreeClaimName(options.worktree);
  const table = options.processTable ?? defaultProcessTable;
  const occupancy = await readOccupancy(worktreesDir, name, table, { fs: options.fs });
  if (!occupancy.ok) return occupancy;
  return { ok: true, value: renderStatus(name, occupancy.value, options.format) };
}

function renderStatus(name: string, status: OccupancyStatus, format: string | undefined): string {
  if (format === WORKTREE_STATUS_FORMAT.JSON) return JSON.stringify({ worktree: name, status });
  return `${name} ${status}`;
}
