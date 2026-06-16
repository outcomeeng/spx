/**
 * Worktree process table — the injected boundary the worktree commands read the
 * OS process table through: liveness (`kill -0`), a process's start time and
 * parent for the controlling-process walk, and its command for agent-runtime
 * recognition. The default binding reads the real process table; tests inject a
 * controlled table.
 *
 * @module domains/worktree/process-table
 */

import { spawnSync } from "node:child_process";
import { hostname } from "node:os";

import { hasErrorCode } from "@/lib/state-store";

import type { ProcessProbe } from "./occupancy-store";

/** The process-table reads the controlling-process resolution and liveness need. */
export interface ProcessTable extends ProcessProbe {
  parentOf(pid: number): number | undefined;
  commandOf(pid: number): string | undefined;
}

// Absolute path to a fixed, unwriteable location so PATH cannot shadow `ps`.
// Where `/bin/ps` is absent, `startTimeOf` returns undefined; classification
// treats a live same-host process with an unreadable start time as occupied
// (see classifyOccupancy), so a live holder is never freed by a missing `ps`.
const PS_COMMAND = "/bin/ps";
const PS_FIELD = {
  START_TIME: "lstart",
  PARENT_PID: "ppid",
  // The full command line, not `comm` — `comm` reports only the executable
  // basename, so a shebang-installed agent run through an interpreter reads as
  // the interpreter (e.g. `node`) and the agent-runtime match misses it. `args`
  // carries the script path, so both native and interpreted agents are matched.
  COMMAND: "args",
} as const;
const SIGNAL_LIVENESS_PROBE = 0;
const PROCESS_EXISTS_NO_PERMISSION = "EPERM";
const PID_RADIX = 10;

function psField(pid: number, field: string): string | undefined {
  const result = spawnSync(PS_COMMAND, ["-o", `${field}=`, "-p", String(pid)], { encoding: "utf8" });
  if (result.status !== 0 || typeof result.stdout !== "string") return undefined;
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

export const defaultProcessTable: ProcessTable = {
  currentHost: () => hostname(),
  isAlive: (pid) => {
    try {
      process.kill(pid, SIGNAL_LIVENESS_PROBE);
      return true;
    } catch (error) {
      return hasErrorCode(error, PROCESS_EXISTS_NO_PERMISSION);
    }
  },
  startTimeOf: (pid) => psField(pid, PS_FIELD.START_TIME),
  parentOf: (pid) => {
    const value = psField(pid, PS_FIELD.PARENT_PID);
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, PID_RADIX);
    return Number.isInteger(parsed) ? parsed : undefined;
  },
  commandOf: (pid) => psField(pid, PS_FIELD.COMMAND),
};
