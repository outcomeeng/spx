import { describe, expect, it } from "vitest";

import { CONTROLLING_PID_ENV, resolveControllingProcess } from "@/domains/worktree/controlling-process";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { createProcessTable, type ProcessTableEntry } from "@testing/harnesses/worktree/harness";

describe("worktree controlling-process resolution", () => {
  it("records the SPX_WORKTREE_CONTROLLING_PID override when it names a live process", () => {
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const [selfPid, overridePid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([[overridePid, { startTime: startedAt, alive: true }]]),
    });

    const result = resolveControllingProcess(selfPid, table, { [CONTROLLING_PID_ENV]: String(overridePid) });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual({ pid: overridePid, startedAt, host });
  });

  it("walks past the transient hook to the ancestor whose command names an agent runtime", () => {
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const [selfPid, hookPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const hookCommand = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.nonAgentCommand());
    const agentCommand = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.agentCommand());
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([
        [selfPid, { ppid: hookPid }],
        [hookPid, { ppid: agentPid, command: hookCommand }],
        [agentPid, { command: agentCommand, startTime: startedAt, alive: true }],
      ]),
    });

    const result = resolveControllingProcess(selfPid, table, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual({ pid: agentPid, startedAt, host });
  });

  it("detects an agent invoked through an interpreter rather than falling back to the hook", () => {
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const [selfPid, hookPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const hookCommand = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.nonAgentCommand());
    const agentCommand = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.interpretedAgentCommand());
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([
        [selfPid, { ppid: hookPid }],
        [hookPid, { ppid: agentPid, command: hookCommand }],
        [agentPid, { command: agentCommand, startTime: startedAt, alive: true }],
      ]),
    });

    const result = resolveControllingProcess(selfPid, table, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual({ pid: agentPid, startedAt, host });
  });

  it("falls back to the immediate parent when no ancestor names an agent runtime", () => {
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const [selfPid, parentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const parentCommand = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.nonAgentCommand());
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([
        [selfPid, { ppid: parentPid }],
        [parentPid, { command: parentCommand, startTime: startedAt, alive: true }],
      ]),
    });

    const result = resolveControllingProcess(selfPid, table, {});

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual({ pid: parentPid, startedAt, host });
  });
});
