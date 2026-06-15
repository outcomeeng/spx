import { describe, expect, it } from "vitest";

import { claimCommand, releaseCommand, statusCommand, WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_STATUS, readClaim, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createProcessTable, type ProcessTableEntry } from "@testing/harnesses/worktree/harness";

describe("worktree command handlers", () => {
  it("writes a claim for the running worktree under the resolved scope", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const host = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.host());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const [selfPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const expectedName = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([[agentPid, { startTime: startedAt, alive: true }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await claimCommand({
        sessionId,
        worktreesDir,
        gitDeps,
        processTable: table,
        selfPid,
        env: { [CONTROLLING_PID_ENV]: String(agentPid) },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const claim = await readClaim(worktreesDir, expectedName);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({ sessionId, host, pid: agentPid, startedAt });
    });
  });

  it("reports occupied for a live holder, unclaimed for no claim, and stale for a dead holder", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const worktreePath = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const name = worktreeClaimName(worktreePath);
    const liveTable = createProcessTable({
      host: record.host,
      processes: new Map<number, ProcessTableEntry>([[record.pid, { startTime: record.startedAt, alive: true }]]),
    });
    const deadTable = createProcessTable({ host: record.host, processes: new Map<number, ProcessTableEntry>() });

    await withTempDir(prefix, async (worktreesDir) => {
      const unclaimed = await statusCommand({
        worktree: worktreePath,
        worktreesDir,
        processTable: liveTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
      });
      expect(unclaimed.ok).toBe(true);
      if (!unclaimed.ok) throw new Error(unclaimed.error);
      expect(JSON.parse(unclaimed.value)).toEqual({ worktree: name, status: OCCUPANCY_STATUS.UNCLAIMED });

      await writeClaim(worktreesDir, name, record);

      const occupied = await statusCommand({ worktree: worktreePath, worktreesDir, processTable: liveTable });
      expect(occupied.ok).toBe(true);
      if (!occupied.ok) throw new Error(occupied.error);
      expect(occupied.value).toContain(OCCUPANCY_STATUS.OCCUPIED);

      const stale = await statusCommand({ worktree: worktreePath, worktreesDir, processTable: deadTable });
      expect(stale.ok).toBe(true);
      if (!stale.ok) throw new Error(stale.error);
      expect(stale.value).toContain(OCCUPANCY_STATUS.STALE);
    });
  });

  it("removes the running worktree's claim", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const name = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record);

      const result = await releaseCommand({ worktreesDir, gitDeps });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const after = await readClaim(worktreesDir, name);
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toBeUndefined();
    });
  });
});
