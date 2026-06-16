import { basename } from "node:path";

import { describe, expect, it } from "vitest";

import { claimCommand, releaseCommand, statusCommand, WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_STATUS, readClaim, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { createSessionGitDeps, SESSION_GIT_DEPS_PATHS, WORKTREE_KIND } from "@testing/harnesses/session/harness";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { createProcessTable, type ProcessTableEntry, withWorktreePool } from "@testing/harnesses/worktree/harness";

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
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const name = worktreeClaimName(basename(env.worktreePath));
      const deadTable = createProcessTable({ host: holder.host, processes: new Map<number, ProcessTableEntry>() });

      const unclaimed = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
      });
      expect(unclaimed.ok).toBe(true);
      if (!unclaimed.ok) throw new Error(unclaimed.error);
      expect(JSON.parse(unclaimed.value)).toEqual({ worktree: name, status: OCCUPANCY_STATUS.UNCLAIMED });

      await writeClaim(env.worktreesDir, name, {
        sessionId,
        host: holder.host,
        pid: holder.pid,
        startedAt: holder.startedAt,
      });

      const occupied = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
      });
      expect(occupied.ok).toBe(true);
      if (!occupied.ok) throw new Error(occupied.error);
      expect(occupied.value).toContain(OCCUPANCY_STATUS.OCCUPIED);

      const occupiedNoArg = await statusCommand({
        cwd: env.worktreePath,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
      });
      expect(occupiedNoArg.ok).toBe(true);
      if (!occupiedNoArg.ok) throw new Error(occupiedNoArg.error);
      expect(occupiedNoArg.value).toContain(OCCUPANCY_STATUS.OCCUPIED);

      const stale = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        worktreesDir: env.worktreesDir,
        processTable: deadTable,
      });
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

  it("reports the current worktree's occupancy when no worktree argument is given", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const claim = await claimCommand({
        sessionId,
        cwd: env.worktreePath,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      const status = await statusCommand({
        cwd: env.worktreePath,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
      });
      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      expect(status.value).toContain(OCCUPANCY_STATUS.OCCUPIED);
    });
  });

  it("resolves the claim scope from the target worktree, not the caller's directory", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const callerPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const probe = createProcessTable({
      host: holder.host,
      processes: new Map<number, ProcessTableEntry>([[holder.pid, { startTime: holder.startedAt, alive: true }]]),
    });

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      const worktreePath = layout.worktree(worktreeName);
      // Claim from the worktree with no explicit scope, so the claim is written
      // under the worktree's own git-common-dir `.spx/worktrees`.
      const claim = await claimCommand({
        sessionId,
        cwd: worktreePath,
        processTable: probe,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      await withTempDir(callerPrefix, async (callerDir) => {
        const status = await statusCommand({
          worktrees: [worktreePath],
          cwd: callerDir,
          processTable: probe,
        });
        expect(status.ok).toBe(true);
        if (!status.ok) throw new Error(status.error);
        expect(status.value).toContain(OCCUPANCY_STATUS.OCCUPIED);
      });
    });
  });
});
