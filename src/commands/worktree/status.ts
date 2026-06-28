/**
 * `spx worktree status` handler — reports worktree occupancy as rendered text
 * lines or machine-parseable JSON.
 *
 * @module commands/worktree/status
 */

import { basename, dirname } from "node:path";

import type { Result } from "@/config/types";
import { agentRuntimeDisplayName } from "@/domains/worktree/controlling-process";
import {
  classifyOccupancy,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
  type OccupancyStatus,
  readClaim,
} from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";

import {
  resolveAllTargetWorktrees,
  type ResolvedTargetWorktree,
  resolveTargetWorktree,
  resolveWorktreesDir,
  type WorktreePathInfo,
  type WorktreeScopeOptions,
} from "@/domains/worktree/resolve";
import { type PlainTreeSection, renderPlainTree } from "@/lib/styled-output/styled-output";

export const WORKTREE_STATUS_FORMAT = {
  JSON: "json",
  TEXT: "text",
} as const;

export type WorktreeStatusFormat = (typeof WORKTREE_STATUS_FORMAT)[keyof typeof WORKTREE_STATUS_FORMAT];

/** Text-status renderings: free worktrees show a marker; running worktrees show runtime and holder pid. */
export const WORKTREE_STATUS_RENDER = {
  FREE: "-",
  RUNNING_FALLBACK_RUNTIME: "PID",
  RUNNING_WORD: "running",
} as const;

export const WORKTREE_STATUS_ERROR = {
  ALL_WITH_EXPLICIT_TARGETS: "worktree status --all cannot be combined with explicit worktree operands",
} as const;

export interface StatusCommandOptions extends WorktreeScopeOptions {
  /** The worktrees to query — paths inside them; defaults to the running directory when omitted. */
  readonly worktrees?: readonly string[];
  /** Whether to query every git-observed worktree in the repository. */
  readonly all?: boolean;
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
  readonly worktreeRoot: string;
  readonly status: OccupancyStatus;
  /** The live holder's pid, session id, and host — present only when `running`. */
  readonly pid?: number;
  readonly session?: string;
  readonly host?: string;
  readonly runtime?: string;
}

interface WorktreeJsonStatusRecord {
  readonly worktree: string;
  readonly status: OccupancyStatus;
  readonly pid?: number;
  readonly session?: string;
  readonly host?: string;
}

/** Reads target worktree occupancy and renders it in the requested format. */
export async function statusCommand(options: StatusCommandOptions): Promise<Result<string>> {
  const multiTargetRequest = options.all === true || (options.worktrees !== undefined && options.worktrees.length > 1);
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
        ? {
          worktree: target.name,
          worktreeRoot: target.worktreeRoot,
          status,
          pid: claim.pid,
          session: claim.sessionId,
          host: claim.host,
          runtime: agentRuntimeDisplayName(options.processTable.commandOf(claim.pid)),
        }
        : { worktree: target.name, worktreeRoot: target.worktreeRoot, status },
    );
  }

  return { ok: true, value: renderStatus(records, options.format, multiTargetRequest) };
}

async function resolveStatusTargets(options: StatusCommandOptions): Promise<Result<readonly ResolvedTargetWorktree[]>> {
  const requested = options.worktrees;
  if (options.all === true) {
    if (requested !== undefined && requested.length > 0) {
      return { ok: false, error: WORKTREE_STATUS_ERROR.ALL_WITH_EXPLICIT_TARGETS };
    }
    return resolveAllTargetWorktrees(options);
  }
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
    const jsonRecords = records.map(toJsonStatusRecord);
    return JSON.stringify(multiTargetRequest ? jsonRecords : jsonRecords[0]);
  }
  return renderTextStatus(records);
}

function toJsonStatusRecord(record: WorktreeStatusRecord): WorktreeJsonStatusRecord {
  const { worktree, status, pid, session, host } = record;
  return pid === undefined ? { worktree, status } : { worktree, status, pid, session, host };
}

function renderTextStatus(records: readonly WorktreeStatusRecord[]): string {
  const sections: PlainTreeSection[] = [];
  const sectionByParent = new Map<string, string[]>();
  for (const record of records) {
    const parent = dirname(record.worktreeRoot);
    const children = sectionByParent.get(parent);
    const rendered = renderTextStatusChild(record);
    if (children === undefined) {
      const newChildren = [rendered];
      sectionByParent.set(parent, newChildren);
      sections.push({ header: parent, children: newChildren });
    } else {
      children.push(rendered);
    }
  }
  return renderPlainTree({ sections });
}

function renderTextStatusChild(record: WorktreeStatusRecord): string {
  if (record.status === OCCUPANCY_STATUS.RUNNING) {
    return `${basename(record.worktreeRoot)}: ${
      record.runtime ?? WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME
    } ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${record.pid}]`;
  }
  return `${basename(record.worktreeRoot)}: ${WORKTREE_STATUS_RENDER.FREE}`;
}
