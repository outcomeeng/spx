/**
 * Worktree-occupancy test harness — controlled `ProcessProbe` and recording
 * `OccupancyFileSystem` doubles passed through dependency injection. The probe
 * answers liveness from caller-supplied state; the recording filesystem wraps a
 * real backing filesystem and captures the call sequence so the atomic
 * temp-then-rename write contract can be asserted without mocking.
 *
 * @module testing/harnesses/worktree/harness
 */

import { execa } from "execa";

import type { Result } from "@/config/types";
import {
  CONTROLLING_PID_ENV,
  type ControllingProcess,
  resolveControllingProcess,
} from "@/domains/worktree/controlling-process";
import type { OccupancyFileSystem, ProcessProbe, WorktreeClaimRecord } from "@/domains/worktree/occupancy-store";
import type { ProcessTable } from "@/domains/worktree/process-table";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";

/** The result of running the built `spx` executable in a worktree CLI test. */
export interface SpxCliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Runs the built `spx` executable with `args`, the given environment overlay, and working directory. */
export async function runWorktreeCli(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  cwd: string,
  input?: string,
): Promise<SpxCliResult> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, ...env },
    input,
    reject: false,
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

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

/** A probe where `record`'s pid is alive on the same host but its start time is unreadable. */
export function createUnreadableStartTimeProbe(record: WorktreeClaimRecord): ProcessProbe {
  return createProcessProbe({ host: record.host, alivePids: new Set([record.pid]), startTimes: new Map() });
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

export interface ControllingProcessEvidence {
  readonly result: Result<ControllingProcess>;
  readonly processPid: number;
  readonly startedAt: string;
  readonly host: string;
}

export interface UnreadableControllingProcessEvidence {
  readonly result: Result<ControllingProcess>;
  readonly processPid: number;
  readonly host: string;
}

export interface InvalidControllingProcessEvidence {
  readonly result: Result<ControllingProcess>;
}

export function withControllingPidOverrideEvidence(
  callback: (evidence: ControllingProcessEvidence) => void,
): void {
  const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
  const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
  const [selfPid, overridePid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
  const table = createProcessTable({
    host,
    processes: new Map<number, ProcessTableEntry>([[overridePid, { startTime: startedAt, alive: true }]]),
  });
  callback({
    result: resolveControllingProcess(selfPid, table, { [CONTROLLING_PID_ENV]: String(overridePid) }),
    processPid: overridePid,
    startedAt,
    host,
  });
}

export function withUnreadableControllingPidOverrideEvidence(
  callback: (evidence: UnreadableControllingProcessEvidence) => void,
): void {
  const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
  const [selfPid, overridePid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
  const table = createProcessTable({
    host,
    processes: new Map<number, ProcessTableEntry>([[overridePid, { alive: true }]]),
  });
  callback({
    result: resolveControllingProcess(selfPid, table, { [CONTROLLING_PID_ENV]: String(overridePid) }),
    processPid: overridePid,
    host,
  });
}

function withAgentAncestorCommandEvidence(
  command: string,
  callback: (evidence: ControllingProcessEvidence) => void,
): void {
  const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
  const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
  const [selfPid, hookPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
  const table = createProcessTable({
    host,
    processes: new Map<number, ProcessTableEntry>([
      [selfPid, { ppid: hookPid }],
      [
        hookPid,
        {
          ppid: agentPid,
          command: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.nonAgentCommand()),
        },
      ],
      [agentPid, { command, startTime: startedAt, alive: true }],
    ]),
  });
  callback({ result: resolveControllingProcess(selfPid, table, {}), processPid: agentPid, startedAt, host });
}

export function withAgentAncestorEvidence(callback: (evidence: ControllingProcessEvidence) => void): void {
  withAgentAncestorCommandEvidence(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.agentCommand()), callback);
}

export function withInterpretedAgentAncestorEvidence(
  callback: (evidence: ControllingProcessEvidence) => void,
): void {
  withAgentAncestorCommandEvidence(
    sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.interpretedAgentCommand()),
    callback,
  );
}

export function withPiControllingProcessEvidence(
  callback: (evidence: ControllingProcessEvidence) => void,
): void {
  withAgentAncestorCommandEvidence(
    sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.interpretedPiAgentCommand()),
    callback,
  );
}

export function withImmediateParentControllingProcessEvidence(
  callback: (evidence: ControllingProcessEvidence) => void,
): void {
  const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
  const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
  const [selfPid, parentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
  const table = createProcessTable({
    host,
    processes: new Map<number, ProcessTableEntry>([
      [selfPid, { ppid: parentPid }],
      [
        parentPid,
        {
          command: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.nonAgentCommand()),
          startTime: startedAt,
          alive: true,
        },
      ],
    ]),
  });
  callback({ result: resolveControllingProcess(selfPid, table, {}), processPid: parentPid, startedAt, host });
}

export function withInvalidParentPidEvidence(callback: (evidence: InvalidControllingProcessEvidence) => void): void {
  const selfPid = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.pid());
  const table = createProcessTable({
    host: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host()),
    processes: new Map<number, ProcessTableEntry>([
      [selfPid, { ppid: 0 }],
      [0, { alive: true }],
    ]),
  });
  callback({ result: resolveControllingProcess(selfPid, table, {}) });
}

export const OCCUPANCY_FS_OP = {
  MKDIR: "mkdir",
  WRITE_FILE: "writeFile",
  RENAME: "rename",
  SYMLINK: "symlink",
  READLINK: "readlink",
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
    symlink: async (target, path) => {
      calls.push({ op: OCCUPANCY_FS_OP.SYMLINK, paths: [target, path] });
      await backing.symlink(target, path);
    },
    readlink: async (path) => {
      calls.push({ op: OCCUPANCY_FS_OP.READLINK, paths: [path] });
      return backing.readlink(path);
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

/** The process the {@link withWorktreePool} table reports alive on its host. */
export interface WorktreePoolHolder {
  readonly pid: number;
  readonly host: string;
  readonly startedAt: string;
}

/** A real pool worktree plus the controlled occupancy machinery a claim/status round-trip needs. */
export interface WorktreePoolEnv {
  /** Absolute path of the provisioned pool worktree. */
  readonly worktreePath: string;
  /** The pool container directory (parent of the worktree). */
  readonly container: string;
  /** A temp `.spx/worktrees` scope directory the claim and status share. */
  readonly worktreesDir: string;
  /** A controlled process table reporting the holder alive on its host. */
  readonly processTable: ProcessTable;
  /** The real filesystem adapter used by command-level occupancy tests. */
  readonly fs: OccupancyFileSystem;
  /** The holder process the table reports alive. */
  readonly holder: WorktreePoolHolder;
}

const WORKTREE_POOL_WORKTREES_PREFIX = "spx-occupancy-worktrees-";

/**
 * Composes a real bare-repository pool worktree (via {@link withWorktreeLayoutEnv})
 * with a temp `.spx/worktrees` directory and a controlled process table reporting
 * `holder` alive, so a claim from the worktree and a later status against it share a
 * deterministic liveness axis — isolating the worktree-name resolution under test.
 */
export async function withWorktreePool(
  options: { readonly worktreeName: string; readonly holder: WorktreePoolHolder },
  callback: (env: WorktreePoolEnv) => Promise<void>,
): Promise<void> {
  await withWorktreeLayoutEnv(
    { bare: true, worktrees: [{ name: options.worktreeName }] },
    (layout) =>
      withTempDir(WORKTREE_POOL_WORKTREES_PREFIX, async (worktreesDir) => {
        const processTable = createProcessTable({
          host: options.holder.host,
          processes: new Map<number, ProcessTableEntry>([
            [options.holder.pid, { alive: true, startTime: options.holder.startedAt }],
          ]),
        });
        await callback({
          worktreePath: layout.worktree(options.worktreeName),
          container: layout.container,
          worktreesDir,
          processTable,
          fs: defaultOccupancyFileSystem,
          holder: options.holder,
        });
      }),
  );
}
