import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  claimCommand,
  releaseCommand,
  statusCommand,
  WORKTREE_STATUS_FORMAT,
  WORKTREE_STATUS_RENDER,
} from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_STATUS, readClaim, writeClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { defaultGitDependencies } from "@/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
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
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const [selfPid, agentPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const expectedName = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);
    const table = createProcessTable({
      host,
      processes: new Map<number, ProcessTableEntry>([[agentPid, { startTime: startedAt, alive: true }]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await claimCommand({
        claimWriteToken,
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        fs: defaultOccupancyFileSystem,
        sessionId,
        worktreesDir,
        gitDeps,
        processTable: table,
        selfPid,
        env: { [CONTROLLING_PID_ENV]: String(agentPid) },
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const claim = await readClaim(worktreesDir, expectedName, { fs: defaultOccupancyFileSystem });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({ sessionId, host, pid: agentPid, startedAt });
    });
  });

  it("reports running with the holder's pid for a live holder, and free for no claim or a dead holder", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const name = worktreeClaimName(basename(env.worktreePath));
      const deadTable = createProcessTable({ host: holder.host, processes: new Map<number, ProcessTableEntry>() });

      const noClaim = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(noClaim.ok).toBe(true);
      if (!noClaim.ok) throw new Error(noClaim.error);
      expect(JSON.parse(noClaim.value)).toEqual({ worktree: name, status: OCCUPANCY_STATUS.FREE });

      await writeClaim(
        env.worktreesDir,
        name,
        {
          sessionId,
          host: holder.host,
          pid: holder.pid,
          startedAt: holder.startedAt,
        },
        { fs: env.fs, writeToken: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken()) },
      );

      const running = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(running.ok).toBe(true);
      if (!running.ok) throw new Error(running.error);
      expect(running.value).toContain(`${WORKTREE_STATUS_RENDER.RUNNING_PID_PREFIX}${holder.pid}`);

      const runningJson = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(runningJson.ok).toBe(true);
      if (!runningJson.ok) throw new Error(runningJson.error);
      expect(JSON.parse(runningJson.value)).toEqual({
        worktree: name,
        status: OCCUPANCY_STATUS.RUNNING,
        pid: holder.pid,
        session: sessionId,
        host: holder.host,
      });

      const runningNoArg = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(runningNoArg.ok).toBe(true);
      if (!runningNoArg.ok) throw new Error(runningNoArg.error);
      expect(runningNoArg.value).toContain(`${WORKTREE_STATUS_RENDER.RUNNING_PID_PREFIX}${holder.pid}`);

      const free = await statusCommand({
        worktrees: [env.worktreePath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: deadTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(free.ok).toBe(true);
      if (!free.ok) throw new Error(free.error);
      expect(free.value).toBe(`${name} ${WORKTREE_STATUS_RENDER.FREE}`);
    });
  });

  it("reports duplicate resolved status targets once in first-seen order", async () => {
    const [worktreeName, subdir] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const fileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const subdirPath = join(env.worktreePath, subdir);
      const filePath = join(subdirPath, fileName);
      await mkdir(subdirPath);
      await writeFile(filePath, fileName);

      const status = await statusCommand({
        worktrees: [env.worktreePath, filePath, subdirPath],
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        format: WORKTREE_STATUS_FORMAT.JSON,
        pathInfo: defaultWorktreePathInfo,
      });

      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      expect(JSON.parse(status.value)).toEqual([
        { worktree: worktreeClaimName(env.worktreePath), status: OCCUPANCY_STATUS.FREE },
      ]);
    });
  });

  it("removes the running worktree's claim", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const gitDeps = createSessionGitDeps({ worktreeKind: WORKTREE_KIND.MAIN_CHECKOUT });
    const name = worktreeClaimName(SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL);

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, writeToken });

      const result = await releaseCommand({
        cwd: SESSION_GIT_DEPS_PATHS.MAIN_CHECKOUT_TOPLEVEL,
        fs: defaultOccupancyFileSystem,
        worktreesDir,
        gitDeps,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);

      const after = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(after.ok).toBe(true);
      if (!after.ok) throw new Error(after.error);
      expect(after.value).toBeUndefined();
    });
  });

  it("reports the current worktree's occupancy when no worktree argument is given", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const claim = await claimCommand({
        claimWriteToken,
        sessionId,
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      const status = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });
      expect(status.ok).toBe(true);
      if (!status.ok) throw new Error(status.error);
      expect(status.value).toContain(`${WORKTREE_STATUS_RENDER.RUNNING_PID_PREFIX}${holder.pid}`);
    });
  });

  it("resolves the claim scope from the target worktree, not the caller's directory", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
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
        claimWriteToken,
        sessionId,
        cwd: worktreePath,
        fs: defaultOccupancyFileSystem,
        gitDeps: defaultGitDependencies,
        processTable: probe,
        selfPid: holder.pid,
        env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);

      await withTempDir(callerPrefix, async (callerDir) => {
        const status = await statusCommand({
          worktrees: [worktreePath],
          cwd: callerDir,
          fs: defaultOccupancyFileSystem,
          gitDeps: defaultGitDependencies,
          processTable: probe,
          pathInfo: defaultWorktreePathInfo,
        });
        expect(status.ok).toBe(true);
        if (!status.ok) throw new Error(status.error);
        expect(status.value).toContain(`${WORKTREE_STATUS_RENDER.RUNNING_PID_PREFIX}${holder.pid}`);
      });
    });
  });
});
