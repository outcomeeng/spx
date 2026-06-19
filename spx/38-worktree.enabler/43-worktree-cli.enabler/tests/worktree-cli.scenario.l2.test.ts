import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { CLI_TIMEOUTS_MS } from "@testing/harnesses/constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

function parsedStatus(stdout: string): string {
  return (JSON.parse(stdout) as { status: string }).status;
}

describe("worktree CLI occupancy round-trip", () => {
  it("reports resolved worktrees from shell-expanded sibling paths", async () => {
    const [claimedName, unclaimedName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const absentName = `${claimedName}${unclaimedName}`;
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: claimedName }, { name: unclaimedName }] },
      async (layout) => {
        const claimedPath = layout.worktree(claimedName);
        const unclaimedPath = layout.worktree(unclaimedName);
        const unresolvedPath = join(layout.container, absentName);
        const controllingPid = String(process.pid);

        const claim = await runWorktreeCli(
          [WORKTREE_CLI.COMMAND, WORKTREE_CLI.CLAIM, WORKTREE_CLI.SESSION_ID_FLAG, sessionId],
          { [CONTROLLING_PID_ENV]: controllingPid },
          claimedPath,
        );
        expect(claim.exitCode).toBe(0);

        const status = await runWorktreeCli(
          [WORKTREE_CLI.COMMAND, WORKTREE_CLI.STATUS, claimedPath, unclaimedPath, unresolvedPath],
          { [CONTROLLING_PID_ENV]: controllingPid },
          layout.container,
        );

        expect(status.exitCode).toBe(0);
        expect(status.stderr).toHaveLength(0);
        expect(status.stdout).not.toContain(String(undefined));
        expect(status.stdout).toContain(`${worktreeClaimName(claimedPath)} ${OCCUPANCY_STATUS.OCCUPIED}`);
        expect(status.stdout).toContain(`${worktreeClaimName(unclaimedPath)} ${OCCUPANCY_STATUS.UNCLAIMED}`);
        expect(status.stdout).not.toContain(absentName);
      },
    );
  });

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
  }, CLI_TIMEOUTS_MS.E2E_LONG_BATCH);
});
