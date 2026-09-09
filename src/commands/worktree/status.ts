/**
 * `spx worktree status` handler — reports worktree occupancy as rendered text
 * lines or machine-parseable JSON.
 *
 * @module commands/worktree/status
 */

import { basename, dirname, sep } from "node:path";

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
  WORKTREE_RESOLVE_ERROR_KIND,
  type WorktreePathInfo,
  type WorktreeResolveError,
  type WorktreeScopeOptions,
} from "@/domains/worktree/resolve";
import { type PlainTreeSection, renderPlainTree } from "@/lib/styled-output/styled-output";
import {
  authoredText,
  externalValue,
  jsonDocument,
  terminal,
  type TerminalText,
} from "@/lib/terminal-text/terminal-text";

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
  NO_TARGETS_RESOLVED: "no worktree status targets resolved",
} as const;

/** Why status produced no report. Carried beside the diagnostic so a caller branches on the kind. */
export const WORKTREE_STATUS_ERROR_KIND = {
  ALL_WITH_EXPLICIT_TARGETS: "all-with-explicit-targets",
  NO_TARGETS_RESOLVED: "no-targets-resolved",
  OCCUPANCY_UNREADABLE: "occupancy-unreadable",
} as const;

export type WorktreeStatusErrorKind = (typeof WORKTREE_STATUS_ERROR_KIND)[keyof typeof WORKTREE_STATUS_ERROR_KIND];

/**
 * A status failure. Every variant carries the kind a caller branches on and the
 * diagnostic it reports, composed where its values were embedded, so the CLI
 * boundary writes it without deciding provenance on the producer's behalf.
 */
export type WorktreeStatusError =
  | WorktreeResolveError
  | { readonly kind: WorktreeStatusErrorKind; readonly text: TerminalText };

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
  /** The holder's agent-runtime display name, authored by the product's own table. */
  readonly runtime?: TerminalText;
}

interface WorktreeJsonStatusRecord {
  readonly worktree: string;
  readonly status: OccupancyStatus;
  readonly pid?: number;
  readonly session?: string;
  readonly host?: string;
}

/** Reads target worktree occupancy and renders it in the requested format. */
export async function statusCommand(
  options: StatusCommandOptions,
): Promise<Result<TerminalText, WorktreeStatusError>> {
  const multiTargetRequest = options.all === true || (options.worktrees !== undefined && options.worktrees.length > 1);
  const targets = await resolveStatusTargets(options);
  if (!targets.ok) return targets;

  const records: WorktreeStatusRecord[] = [];
  for (const target of targets.value) {
    const worktreesDir = await resolveWorktreesDir({ ...options, cwd: target.worktreeRoot });
    const claimResult = await readClaim(worktreesDir, target.name, { fs: options.fs });
    // The target resolved and only its occupancy could not be read, which is a different
    // failure from resolving no target at all. The store composed its own diagnostic, so it
    // is carried as it stands.
    if (!claimResult.ok) {
      return {
        ok: false,
        error: { kind: WORKTREE_STATUS_ERROR_KIND.OCCUPANCY_UNREADABLE, text: claimResult.error },
      };
    }
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

async function resolveStatusTargets(
  options: StatusCommandOptions,
): Promise<Result<readonly ResolvedTargetWorktree[], WorktreeStatusError>> {
  const requested = options.worktrees;
  if (options.all === true) {
    if (requested !== undefined && requested.length > 0) {
      return {
        ok: false,
        error: {
          kind: WORKTREE_STATUS_ERROR_KIND.ALL_WITH_EXPLICIT_TARGETS,
          text: authoredText(WORKTREE_STATUS_ERROR.ALL_WITH_EXPLICIT_TARGETS),
        },
      };
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
  let firstError: WorktreeResolveError | undefined;
  for (const worktree of requested) {
    const target = await resolveTargetWorktree({ ...options, worktree });
    if (!target.ok) {
      // An ambiguous basename names no determinate worktree, so it refuses the whole request
      // rather than being skipped like a path that simply resolved to nothing.
      if (target.error.kind === WORKTREE_RESOLVE_ERROR_KIND.AMBIGUOUS_BASENAME) return target;
      firstError ??= target.error;
      continue;
    }
    appendFirstSeenTarget(targets, seenRoots, target.value);
  }

  if (targets.length === 0) {
    return {
      ok: false,
      error: firstError ?? {
        kind: WORKTREE_STATUS_ERROR_KIND.NO_TARGETS_RESOLVED,
        text: authoredText(WORKTREE_STATUS_ERROR.NO_TARGETS_RESOLVED),
      },
    };
  }

  return { ok: true, value: targets };
}

function appendFirstSeenTarget(
  targets: ResolvedTargetWorktree[],
  seenRoots: Set<string>,
  target: ResolvedTargetWorktree,
): void {
  if (seenRoots.has(target.worktreeRoot)) return;
  seenRoots.add(target.worktreeRoot);
  targets.push(target);
}

function renderStatus(
  records: readonly WorktreeStatusRecord[],
  format: string | undefined,
  multiTargetRequest: boolean,
): TerminalText {
  if (format === WORKTREE_STATUS_FORMAT.JSON) {
    const jsonRecords = records.map(toJsonStatusRecord);
    return jsonDocument(multiTargetRequest ? jsonRecords : jsonRecords[0]);
  }
  return renderTextStatus(records);
}

function toJsonStatusRecord(record: WorktreeStatusRecord): WorktreeJsonStatusRecord {
  const { worktree, status, pid, session, host } = record;
  return pid === undefined ? { worktree, status } : { worktree, status, pid, session, host };
}

function renderTextStatus(records: readonly WorktreeStatusRecord[]): TerminalText {
  const sections: PlainTreeSection[] = [];
  const sectionByParent = new Map<string, TerminalText[]>();
  for (const record of records) {
    const parent = dirname(record.worktreeRoot);
    const children = sectionByParent.get(parent);
    const rendered = renderTextStatusChild(record);
    if (children === undefined) {
      const newChildren = [rendered];
      sectionByParent.set(parent, newChildren);
      sections.push({ header: renderParentDirectory(parent), children: newChildren });
    } else {
      children.push(rendered);
    }
  }
  return renderPlainTree({ sections });
}

// The parent directory is a filesystem path, so it is external; the trailing separator that
// marks it as a directory is the product's own.
function renderParentDirectory(parent: string): TerminalText {
  return parent.endsWith(sep)
    ? terminal`${externalValue(parent)}`
    : terminal`${externalValue(parent)}${authoredText(sep)}`;
}

// The worktree basename is a filesystem reading and the pid a claim-file reading; the runtime
// display name, the words, and the brackets around them are the product's own.
function renderTextStatusChild(record: WorktreeStatusRecord): TerminalText {
  const name = externalValue(basename(record.worktreeRoot));
  if (record.status === OCCUPANCY_STATUS.RUNNING) {
    const runtime = record.runtime ?? authoredText(WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME);
    return terminal`${name}: ${runtime} ${authoredText(WORKTREE_STATUS_RENDER.RUNNING_WORD)} [${
      externalValue(String(record.pid))
    }]`;
  }
  return terminal`${name}: ${authoredText(WORKTREE_STATUS_RENDER.FREE)}`;
}
