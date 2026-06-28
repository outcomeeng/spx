import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { claimCommand, statusCommand, WORKTREE_STATUS_RENDER } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { defaultGitDependencies } from "@/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { createProcessTable, type ProcessTableEntry, withWorktreePool } from "@testing/harnesses/worktree/harness";

describe("worktree status path-form resolution", () => {
  it("maps every path that denotes the claimed worktree to its occupancy", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const [subdir, fileName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());

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

      // A real subdirectory inside the worktree — `git rev-parse --show-toplevel`
      // resolves it back to the worktree root.
      const subdirPath = join(env.worktreePath, subdir);
      await mkdir(subdirPath);

      const filePath = join(env.worktreePath, fileName);
      await writeFile(filePath, fileName);

      const forms = [env.worktreePath, ".", "./", subdirPath, filePath];
      for (const form of forms) {
        const status = await statusCommand({
          worktrees: [form],
          cwd: env.worktreePath,
          fs: env.fs,
          gitDeps: defaultGitDependencies,
          worktreesDir: env.worktreesDir,
          processTable: env.processTable,
          pathInfo: defaultWorktreePathInfo,
        });
        expect(status.ok, `form ${form}`).toBe(true);
        if (!status.ok) throw new Error(`form ${form}: ${status.error}`);
        expect(status.value, `form ${form}`).toContain(
          `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
        );
      }
    });
  });

  it("maps a bare pool worktree basename to the matching git-observed worktree", async () => {
    const [claimedName, callerName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const tempPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const processTable = createProcessTable({
      host: holder.host,
      processes: new Map<number, ProcessTableEntry>([
        [holder.pid, { alive: true, startTime: holder.startedAt }],
      ]),
    });

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: claimedName }, { name: callerName }] },
      async (layout) => {
        await withTempDir(tempPrefix, async (worktreesDir) => {
          const claim = await claimCommand({
            claimWriteToken,
            sessionId,
            cwd: layout.worktree(claimedName),
            fs: defaultOccupancyFileSystem,
            gitDeps: defaultGitDependencies,
            worktreesDir,
            processTable,
            selfPid: holder.pid,
            env: { [CONTROLLING_PID_ENV]: String(holder.pid) },
          });
          expect(claim.ok).toBe(true);
          if (!claim.ok) throw new Error(claim.error);

          const status = await statusCommand({
            worktrees: [claimedName],
            cwd: layout.worktree(callerName),
            fs: defaultOccupancyFileSystem,
            gitDeps: defaultGitDependencies,
            worktreesDir,
            processTable,
            pathInfo: defaultWorktreePathInfo,
          });

          expect(status.ok).toBe(true);
          if (!status.ok) throw new Error(status.error);
          expect(status.value).toContain(`${claimedName}:`);
          expect(status.value).toContain(
            `${WORKTREE_STATUS_RENDER.RUNNING_FALLBACK_RUNTIME} ${WORKTREE_STATUS_RENDER.RUNNING_WORD} [${holder.pid}]`,
          );
        });
      },
    );
  });
});
