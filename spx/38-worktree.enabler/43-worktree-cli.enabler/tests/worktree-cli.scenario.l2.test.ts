import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

function parsedStatus(stdout: string): string {
  return (JSON.parse(stdout) as { status: string }).status;
}

describe("worktree CLI occupancy round-trip", () => {
  it("reports the claimed worktree occupied across path forms and refuses a non-worktree path", async () => {
    const [worktreeName, absentName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const subdir = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const worktreesPrefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(worktreesPrefix, async (worktreesDir) => {
        const worktreePath = layout.worktree(worktreeName);
        const subdirPath = join(worktreePath, subdir);
        await mkdir(subdirPath);
        const controllingPid = String(process.pid);

        // Claim the current worktree; the live test process is the holder.
        const claim = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.CLAIM,
            WORKTREE_CLI.SESSION_ID_FLAG,
            sessionId,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          { [CONTROLLING_PID_ENV]: controllingPid },
          worktreePath,
        );
        expect(claim.exitCode).toBe(0);

        // Every form that denotes the claimed worktree reports occupied: no
        // argument (current worktree), `.`, the absolute root, and a subdir.
        const denotingForms: readonly string[] = ["", ".", worktreePath, subdirPath];
        for (const form of denotingForms) {
          const args = form.length > 0
            ? [
              WORKTREE_CLI.COMMAND,
              WORKTREE_CLI.STATUS,
              form,
              WORKTREE_CLI.FORMAT_FLAG,
              WORKTREE_STATUS_FORMAT.JSON,
              WORKTREE_CLI.WORKTREES_DIR_FLAG,
              worktreesDir,
            ]
            : [
              WORKTREE_CLI.COMMAND,
              WORKTREE_CLI.STATUS,
              WORKTREE_CLI.FORMAT_FLAG,
              WORKTREE_STATUS_FORMAT.JSON,
              WORKTREE_CLI.WORKTREES_DIR_FLAG,
              worktreesDir,
            ];
          const status = await runWorktreeCli(args, { [CONTROLLING_PID_ENV]: controllingPid }, worktreePath);
          expect(status.exitCode, `form "${form}"`).toBe(0);
          expect(parsedStatus(status.stdout), `form "${form}"`).toBe(OCCUPANCY_STATUS.OCCUPIED);
        }

        // A path that is not a worktree is refused, not reported unclaimed.
        const nonWorktree = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            join(layout.container, absentName),
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          {},
          worktreePath,
        );
        expect(nonWorktree.exitCode).not.toBe(0);
      });
    });
  });
});
