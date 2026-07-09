import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/worktree/index";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { defaultGitDependencies } from "@/lib/git/root";
import { defaultWorktreePathInfo } from "@/lib/worktree-path-info";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

describe("worktree status non-worktree path compliance", () => {
  it("NEVER reports a path outside every worktree as an unclaimed worktree", async () => {
    const [worktreeName, absentName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      // A sibling path under the pool container that was never provisioned as a
      // worktree — the `spx worktree status ~/…/spx-non-existent` case.
      const nonWorktreePath = join(env.container, absentName);

      const status = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktrees: [nonWorktreePath],
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });

      // A path that resolves to no worktree must be refused, never rendered as a
      // free worktree.
      expect(status.ok).toBe(false);
      if (status.ok) {
        throw new Error(`expected refusal, got status "${status.value}"`);
      }
      expect(status.error).not.toContain(OCCUPANCY_STATUS.FREE);
    });
  });

  it("NEVER reports an existing non-directory path as a free worktree", async () => {
    const [worktreeName, fileName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const nonWorktreeFilePath = join(env.container, fileName);
      await writeFile(nonWorktreeFilePath, fileName);

      const status = await statusCommand({
        cwd: env.worktreePath,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktrees: [nonWorktreeFilePath],
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        pathInfo: defaultWorktreePathInfo,
      });

      expect(status.ok).toBe(false);
      if (status.ok) {
        throw new Error(`expected refusal, got status "${status.value}"`);
      }
      expect(status.error).not.toContain(OCCUPANCY_STATUS.FREE);
    });
  });
});
