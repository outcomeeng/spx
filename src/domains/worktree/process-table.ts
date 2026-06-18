/**
 * Worktree process table contract — the injected boundary the worktree commands
 * read the OS process table through: liveness, a process's start time and
 * parent for the controlling-process walk, and its command for agent-runtime
 * recognition.
 *
 * @module domains/worktree/process-table
 */

import type { ProcessProbe } from "./occupancy-store";

/** The process-table reads the controlling-process resolution and liveness need. */
export interface ProcessTable extends ProcessProbe {
  parentOf(pid: number): number | undefined;
  commandOf(pid: number): string | undefined;
}
