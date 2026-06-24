/**
 * Real OS-backed worktree process table adapter.
 *
 * @module lib/worktree-process-table
 */

import { spawnSync } from "node:child_process";
import { hostname } from "node:os";

import type { ProcessTable } from "@/domains/worktree/process-table";
import { hasErrorCode } from "@/lib/state-store";

// Absolute path to a fixed, unwriteable location so PATH cannot shadow `ps`.
// Where `/bin/ps` is absent, `startTimeOf` returns undefined; classification
// treats a live same-host process with an unreadable start time as running.
const PS_COMMAND = "/bin/ps";
const PS_FIELD = {
  START_TIME: "lstart",
  PARENT_PID: "ppid",
  // The full command line, not `comm`: interpreted agent runtimes otherwise
  // report only the interpreter basename and miss the agent-command match.
  COMMAND: "args",
} as const;
const SIGNAL_LIVENESS_PROBE = 0;
const PROCESS_EXISTS_NO_PERMISSION = "EPERM";
const PID_RADIX = 10;
// Keep formatted start times stable across claim and status reads, which may
// run under different agent environments and compare the same live process.
const STABLE_PS_ENV = { ...process.env, TZ: "UTC", LC_ALL: "C" } as const;

function psField(pid: number, field: string): string | undefined {
  const result = spawnSync(PS_COMMAND, ["-o", `${field}=`, "-p", String(pid)], {
    encoding: "utf8",
    env: STABLE_PS_ENV,
  });
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
