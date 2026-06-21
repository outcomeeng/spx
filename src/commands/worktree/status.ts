/**
 * `spx worktree status` handler — reports worktree occupancy as rendered text
 * lines or machine-parseable JSON.
 *
 * @module commands/worktree/status
 */

import type { Result } from "@/config/types";
import { type OccupancyFileSystem, type OccupancyStatus, readOccupancy } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";

import {
  type ResolvedTargetWorktree,
  resolveTargetWorktree,
  resolveWorktreesDir,
  type WorktreePathInfo,
  type WorktreeScopeOptions,
} from "@/domains/worktree/resolve";

export const WORKTREE_STATUS_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export type WorktreeStatusFormat = (typeof WORKTREE_STATUS_FORMAT)[keyof typeof WORKTREE_STATUS_FORMAT];

export interface StatusCommandOptions extends WorktreeScopeOptions {
  /** The worktrees to query — paths inside them; defaults to the running directory when omitted. */
  readonly worktrees?: readonly string[];
  /** Output format; defaults to text. */
  readonly format?: string;
  /** Injected process table. */
  readonly processTable: ProcessTable;
  /** Injected claim filesystem. */
  readonly fs: OccupancyFileSystem;
  /** Injected path-info probe for target status paths. */
  readonly pathInfo: WorktreePathInfo;
}

interface WorktreeStatusRecord {
  readonly worktree: string;
  readonly status: OccupancyStatus;
}

/** Reads target worktree occupancy and renders it in the requested format. */
export async function statusCommand(options: StatusCommandOptions): Promise<Result<string>> {
  const multiTargetRequest = options.worktrees !== undefined && options.worktrees.length > 1;
  const targets = await resolveStatusTargets(options);
  if (!targets.ok) return targets;

  const records: WorktreeStatusRecord[] = [];
  for (const target of targets.value) {
    const worktreesDir = await resolveWorktreesDir({ ...options, cwd: target.worktreeRoot });
    const occupancy = await readOccupancy(worktreesDir, target.name, options.processTable, { fs: options.fs });
    if (!occupancy.ok) return occupancy;
    records.push({ worktree: target.name, status: occupancy.value });
  }

  return { ok: true, value: renderStatus(records, options.format, multiTargetRequest) };
}

async function resolveStatusTargets(options: StatusCommandOptions): Promise<Result<readonly ResolvedTargetWorktree[]>> {
  const requested = options.worktrees;
  if (requested === undefined || requested.length === 0) {
    const target = await resolveTargetWorktree(options);
    if (!target.ok) return target;
    return { ok: true, value: [target.value] };
  }

  const targets: ResolvedTargetWorktree[] = [];
  let firstError: string | undefined;
  for (const worktree of requested) {
    const target = await resolveTargetWorktree({ ...options, worktree });
    if (target.ok) {
      targets.push(target.value);
    } else {
      firstError ??= target.error;
    }
  }

  if (targets.length === 0) {
    return { ok: false, error: firstError ?? "no worktree status targets resolved" };
  }

  return { ok: true, value: targets };
}

function renderStatus(
  records: readonly WorktreeStatusRecord[],
  format: string | undefined,
  multiTargetRequest: boolean,
): string {
  if (format === WORKTREE_STATUS_FORMAT.JSON) {
    return JSON.stringify(multiTargetRequest ? records : records[0]);
  }
  return records.map(renderTextStatus).join("\n");
}

function renderTextStatus(record: WorktreeStatusRecord): string {
  return `${record.worktree} ${record.status}`;
}
