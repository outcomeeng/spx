/**
 * Worktree-occupancy test harness — controlled `ProcessProbe` and recording
 * `OccupancyFileSystem` doubles passed through dependency injection. The probe
 * answers liveness from caller-supplied state; the recording filesystem wraps a
 * real backing filesystem and captures the call sequence so the atomic
 * temp-then-rename write contract can be asserted without mocking.
 *
 * @module testing/harnesses/worktree/harness
 */

import type { OccupancyFileSystem, ProcessProbe, WorktreeClaimRecord } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";

export interface ProcessProbeState {
  readonly host: string;
  readonly alivePids: ReadonlySet<number>;
  readonly startTimes: ReadonlyMap<number, string>;
}

export function createProcessProbe(state: ProcessProbeState): ProcessProbe {
  return {
    currentHost: () => state.host,
    isAlive: (pid) => state.alivePids.has(pid),
    startTimeOf: (pid) => state.startTimes.get(pid),
  };
}

/** A probe under which `record`'s holder is alive on the same host with a matching start time. */
export function createLiveHolderProbe(record: WorktreeClaimRecord): ProcessProbe {
  return createProcessProbe({
    host: record.host,
    alivePids: new Set([record.pid]),
    startTimes: new Map([[record.pid, record.startedAt]]),
  });
}

/** A probe under which `record`'s holder process is not alive. */
export function createDeadHolderProbe(record: WorktreeClaimRecord): ProcessProbe {
  return createProcessProbe({ host: record.host, alivePids: new Set(), startTimes: new Map() });
}

/** A probe on a different host, so `record`'s liveness is undecidable off-host. */
export function createForeignHostProbe(record: WorktreeClaimRecord, otherHost: string): ProcessProbe {
  return createProcessProbe({
    host: otherHost,
    alivePids: new Set([record.pid]),
    startTimes: new Map([[record.pid, record.startedAt]]),
  });
}

/** A probe where `record`'s pid is alive but its live start time differs — a recycled pid. */
export function createRecycledPidProbe(record: WorktreeClaimRecord, liveStartTime: string): ProcessProbe {
  return createProcessProbe({
    host: record.host,
    alivePids: new Set([record.pid]),
    startTimes: new Map([[record.pid, liveStartTime]]),
  });
}

/** One process's facts in a controlled {@link createProcessTable}. */
export interface ProcessTableEntry {
  readonly ppid?: number;
  readonly command?: string;
  readonly startTime?: string;
  readonly alive?: boolean;
}

export interface ProcessTableState {
  readonly host: string;
  readonly processes: ReadonlyMap<number, ProcessTableEntry>;
}

/** A controlled {@link ProcessTable} answering ancestry, command, liveness, and start time from caller state. */
export function createProcessTable(state: ProcessTableState): ProcessTable {
  const entry = (pid: number): ProcessTableEntry | undefined => state.processes.get(pid);
  return {
    currentHost: () => state.host,
    isAlive: (pid) => entry(pid)?.alive ?? false,
    startTimeOf: (pid) => entry(pid)?.startTime,
    parentOf: (pid) => entry(pid)?.ppid,
    commandOf: (pid) => entry(pid)?.command,
  };
}

export const OCCUPANCY_FS_OP = {
  MKDIR: "mkdir",
  WRITE_FILE: "writeFile",
  RENAME: "rename",
  READ_FILE: "readFile",
  RM: "rm",
} as const;

export type OccupancyFsOp = (typeof OCCUPANCY_FS_OP)[keyof typeof OCCUPANCY_FS_OP];

export interface OccupancyFsCall {
  readonly op: OccupancyFsOp;
  readonly paths: readonly string[];
}

export interface RecordingOccupancyFileSystem extends OccupancyFileSystem {
  readonly calls: readonly OccupancyFsCall[];
}

/**
 * Wraps a backing filesystem, delegating every operation to it while appending
 * each call's op and path arguments to `calls`, so a test can assert the
 * temp-then-rename ordering the atomic-write contract requires.
 */
export function createRecordingOccupancyFileSystem(backing: OccupancyFileSystem): RecordingOccupancyFileSystem {
  const calls: OccupancyFsCall[] = [];
  return {
    calls,
    mkdir: async (path, options) => {
      calls.push({ op: OCCUPANCY_FS_OP.MKDIR, paths: [path] });
      await backing.mkdir(path, options);
    },
    writeFile: async (path, data) => {
      calls.push({ op: OCCUPANCY_FS_OP.WRITE_FILE, paths: [path] });
      await backing.writeFile(path, data);
    },
    rename: async (from, to) => {
      calls.push({ op: OCCUPANCY_FS_OP.RENAME, paths: [from, to] });
      await backing.rename(from, to);
    },
    readFile: async (path, encoding) => {
      calls.push({ op: OCCUPANCY_FS_OP.READ_FILE, paths: [path] });
      return backing.readFile(path, encoding);
    },
    rm: async (path, options) => {
      calls.push({ op: OCCUPANCY_FS_OP.RM, paths: [path] });
      await backing.rm(path, options);
    },
  };
}
