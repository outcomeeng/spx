import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { claimCommand, statusCommand } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { defaultGitDependencies } from "@/git/root";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

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
        expect(status.value, `form ${form}`).toContain(OCCUPANCY_STATUS.OCCUPIED);
      }
    });
  });
});
