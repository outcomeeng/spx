/**
 * Controlling-process resolution — finds the holding agent process whose
 * liveness means the worktree is held: an explicit pid override, else the
 * nearest ancestor whose command names a known agent runtime, else the
 * immediate parent. Pure over an injected process table.
 *
 * @module domains/worktree/controlling-process
 */

import type { Result } from "@/config/types";

import type { ProcessTable } from "./process-table";

export const CONTROLLING_PID_ENV = "SPX_WORKTREE_CONTROLLING_PID";
export const AGENT_RUNTIME_NAMES = ["claude", "codex"] as const;
export const AGENT_COMMAND_PATTERN = new RegExp(`\\b(?:${AGENT_RUNTIME_NAMES.join("|")})\\b`, "i");

export const CONTROLLING_PROCESS_ERROR = {
  UNRESOLVED: "worktree controlling process could not be resolved",
} as const;

const MAX_ANCESTRY_DEPTH = 64;
const PID_RADIX = 10;

/** The holding agent process recorded in a worktree claim. */
export interface ControllingProcess {
  readonly pid: number;
  readonly startedAt: string;
  readonly host: string;
}

export type ControllingProcessEnv = { readonly [key: string]: string | undefined };

/**
 * Resolves the controlling process for `selfPid` (spx's own pid): an explicit
 * `SPX_WORKTREE_CONTROLLING_PID` override, else the nearest ancestor whose
 * command names a known agent runtime, else the immediate parent. The first
 * candidate whose start time resolves is recorded.
 */
export function resolveControllingProcess(
  selfPid: number,
  table: ProcessTable,
  env: ControllingProcessEnv,
): Result<ControllingProcess> {
  const host = table.currentHost();
  for (const pid of controllingPidCandidates(selfPid, table, env)) {
    const startedAt = table.startTimeOf(pid);
    if (startedAt !== undefined) return { ok: true, value: { pid, startedAt, host } };
  }
  return { ok: false, error: CONTROLLING_PROCESS_ERROR.UNRESOLVED };
}

function* controllingPidCandidates(
  selfPid: number,
  table: ProcessTable,
  env: ControllingProcessEnv,
): Generator<number> {
  const override = parsePid(env[CONTROLLING_PID_ENV]);
  if (override !== undefined) yield override;

  const agent = findAgentAncestor(selfPid, table);
  if (agent !== undefined) yield agent;

  const parent = table.parentOf(selfPid);
  if (parent !== undefined) yield parent;
}

function findAgentAncestor(selfPid: number, table: ProcessTable): number | undefined {
  let pid = table.parentOf(selfPid);
  for (let depth = 0; pid !== undefined && depth < MAX_ANCESTRY_DEPTH; depth += 1) {
    const command = table.commandOf(pid);
    if (command !== undefined && AGENT_COMMAND_PATTERN.test(command)) return pid;
    pid = table.parentOf(pid);
  }
  return undefined;
}

function parsePid(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number.parseInt(value, PID_RADIX);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
