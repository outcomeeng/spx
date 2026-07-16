/**
 * Controlling-process resolution — finds the holding agent process whose
 * liveness means the worktree is held: an explicit pid override, else the
 * nearest ancestor whose command names a known agent runtime, else the
 * immediate parent. Pure over an injected process table.
 *
 * @module domains/worktree/controlling-process
 */

import { basename } from "node:path";

import type { Result } from "@/config/types";

import { unreadableStartedAt } from "./occupancy-store";
import type { ProcessTable } from "./process-table";

export const CONTROLLING_PID_ENV = "SPX_WORKTREE_CONTROLLING_PID";
export const AGENT_RUNTIME = {
  CLAUDE: "claude",
  CODEX: "codex",
  PI: "pi",
} as const;
export const AGENT_RUNTIME_NAMES = [AGENT_RUNTIME.CLAUDE, AGENT_RUNTIME.CODEX, AGENT_RUNTIME.PI] as const;
export type AgentRuntimeName = (typeof AGENT_RUNTIME_NAMES)[number];
export const AGENT_RUNTIME_DISPLAY_NAME: Readonly<Record<AgentRuntimeName, string>> = {
  claude: "Claude Code",
  codex: "Codex",
  pi: "Pi",
} as const;

const COMMAND_TOKEN_SEPARATOR = /\s+/;
const EXECUTABLE_TOKEN_INDEX = 0;
const INVOKED_SCRIPT_TOKEN_INDEX = 1;

export const CONTROLLING_PROCESS_ERROR = {
  UNRESOLVED: "worktree controlling process could not be resolved",
} as const;

const MAX_ANCESTRY_DEPTH = 64;
const MIN_VALID_PID = 1;
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
    if (table.isAlive(pid)) return { ok: true, value: { pid, startedAt: unreadableStartedAt(pid), host } };
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
  if (parent !== undefined && isValidPid(parent)) yield parent;
}

function findAgentAncestor(selfPid: number, table: ProcessTable): number | undefined {
  let pid = table.parentOf(selfPid);
  for (let depth = 0; pid !== undefined && isValidPid(pid) && depth < MAX_ANCESTRY_DEPTH; depth += 1) {
    const command = table.commandOf(pid);
    if (agentRuntimeName(command) !== undefined) return pid;
    pid = table.parentOf(pid);
  }
  return undefined;
}

export function agentRuntimeDisplayName(command: string | undefined): string | undefined {
  const name = agentRuntimeName(command);
  return name === undefined ? undefined : AGENT_RUNTIME_DISPLAY_NAME[name];
}

function agentRuntimeName(command: string | undefined): AgentRuntimeName | undefined {
  if (command === undefined) return undefined;
  const tokens = command.trim().split(COMMAND_TOKEN_SEPARATOR);
  return runtimeNameFromToken(tokens[EXECUTABLE_TOKEN_INDEX])
    ?? runtimeNameFromToken(tokens[INVOKED_SCRIPT_TOKEN_INDEX]);
}

function runtimeNameFromToken(token: string | undefined): AgentRuntimeName | undefined {
  if (token === undefined) return undefined;
  const executableName = basename(token).toLowerCase();
  return AGENT_RUNTIME_NAMES.find((name) => name === executableName);
}

function parsePid(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number.parseInt(value, PID_RADIX);
  return isValidPid(parsed) ? parsed : undefined;
}

function isValidPid(pid: number): boolean {
  return Number.isInteger(pid) && pid >= MIN_VALID_PID;
}
