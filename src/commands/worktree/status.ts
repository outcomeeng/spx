/**
 * `spx worktree status` handler — reports worktree occupancy as rendered text
 * lines or machine-parseable JSON.
 *
 * @module commands/worktree/status
 */

import type { Result } from "@/config/types";
import {
  classifyOccupancy,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
  type OccupancyStatus,
  readClaim,
} from "@/domains/worktree/occupancy-store";
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

/** Text-status renderings: a `free` worktree shows this marker; a `running` one shows the pid prefix then the holder's pid. */
export const WORKTREE_STATUS_RENDER = {
  FREE: "-",
  RUNNING_PID_PREFIX: "PID ",
} as const;

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
  /** The live holder's pid, session id, and host — present only when `running`. */
  readonly pid?: number;
  readonly session?: string;
  readonly host?: string;
}

/** Reads target worktree occupancy and renders it in the requested format. */
export async function statusCommand(options: StatusCommandOptions): Promise<Result<string>> {
  const multiTargetRequest = options.worktrees !== undefined && options.worktrees.length > 1;
  const targets = await resolveStatusTargets(options);
  if (!targets.ok) return targets;

  const records: WorktreeStatusRecord[] = [];
  for (const target of targets.value) {
    const worktreesDir = await resolveWorktreesDir({ ...options, cwd: target.worktreeRoot });
    const claimResult = await readClaim(worktreesDir, target.name, { fs: options.fs });
    if (!claimResult.ok) return claimResult;
    const claim = claimResult.value;
    const status = classifyOccupancy(claim, options.processTable);
    records.push(
      status === OCCUPANCY_STATUS.RUNNING && claim !== undefined
        ? { worktree: target.name, status, pid: claim.pid, session: claim.sessionId, host: claim.host }
        : { worktree: target.name, status },
    );
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
  const seenRoots = new Set<string>();
  let firstError: string | undefined;
  for (const worktree of requested) {
    const target = await resolveTargetWorktree({ ...options, worktree });
    if (target.ok) {
      if (seenRoots.has(target.value.worktreeRoot)) continue;
      seenRoots.add(target.value.worktreeRoot);
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
  if (record.status === OCCUPANCY_STATUS.RUNNING) {
    return `${record.worktree} ${WORKTREE_STATUS_RENDER.RUNNING_PID_PREFIX}${record.pid} (${record.session} @ ${record.host})`;
  }
  return `${record.worktree} ${WORKTREE_STATUS_RENDER.FREE}`;
}
