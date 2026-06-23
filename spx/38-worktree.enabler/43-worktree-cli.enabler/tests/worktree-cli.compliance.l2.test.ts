import { mkdir, readdir, writeFile } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_CLAIM, OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

describe("worktree CLI compliance", () => {
  it("ALWAYS: a successful claim writes nothing to stdout and exits 0", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runWorktreeCli(
        [
          WORKTREE_CLI.COMMAND,
          WORKTREE_CLI.CLAIM,
          WORKTREE_CLI.SESSION_ID_FLAG,
          sessionId,
          WORKTREE_CLI.WORKTREES_DIR_FLAG,
          worktreesDir,
        ],
        { [CONTROLLING_PID_ENV]: String(process.pid) },
        worktreesDir,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toHaveLength(0);
      const files = await readdir(worktreesDir);
      expect(files.some((file) => file.endsWith(OCCUPANCY_CLAIM.FILE_EXTENSION))).toBe(true);
    });
  });

  it("ALWAYS: status --format json writes a parseable record and exits 0", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(prefix, async (worktreesDir) => {
        const result = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            ".",
            WORKTREE_CLI.FORMAT_FLAG,
            WORKTREE_STATUS_FORMAT.JSON,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          {},
          layout.worktree(worktreeName),
        );

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(result.stdout) as { status: string };
        expect(parsed.status).toBe(OCCUPANCY_STATUS.UNCLAIMED);
      });
    });
  });

  it("ALWAYS: multi-target status --format json writes parseable records and exits 0", async () => {
    const [firstName, secondName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: firstName }, { name: secondName }] },
      async (layout) => {
        const firstPath = layout.worktree(firstName);
        const secondPath = layout.worktree(secondName);
        const result = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            WORKTREE_CLI.FORMAT_FLAG,
            WORKTREE_STATUS_FORMAT.JSON,
            firstPath,
            secondPath,
          ],
          {},
          layout.container,
        );

        expect(result.exitCode).toBe(0);
        const parsed = JSON.parse(result.stdout) as readonly { worktree: string; status: string }[];
        expect(parsed).toEqual([
          { worktree: worktreeClaimName(firstPath), status: OCCUPANCY_STATUS.UNCLAIMED },
          { worktree: worktreeClaimName(secondPath), status: OCCUPANCY_STATUS.UNCLAIMED },
        ]);
      },
    );
  });

  it("ALWAYS: multi-target status --format json de-duplicates resolved worktree roots", async () => {
    const [worktreeName, subdir] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const fileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      const worktreePath = layout.worktree(worktreeName);
      const subdirPath = join(worktreePath, subdir);
      const filePath = join(subdirPath, fileName);
      await mkdir(subdirPath);
      await writeFile(filePath, fileName);

      const result = await runWorktreeCli(
        [
          WORKTREE_CLI.COMMAND,
          WORKTREE_CLI.STATUS,
          WORKTREE_CLI.FORMAT_FLAG,
          WORKTREE_STATUS_FORMAT.JSON,
          worktreePath,
          filePath,
        ],
        {},
        layout.container,
      );

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([
        { worktree: worktreeClaimName(worktreePath), status: OCCUPANCY_STATUS.UNCLAIMED },
      ]);
    });
  });

  it("ALWAYS: multi-target status --format json returns an array when one candidate resolves", async () => {
    const [worktreeName, absentName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      const worktreePath = layout.worktree(worktreeName);
      const absentPath = join(layout.container, absentName);
      const result = await runWorktreeCli(
        [
          WORKTREE_CLI.COMMAND,
          WORKTREE_CLI.STATUS,
          WORKTREE_CLI.FORMAT_FLAG,
          WORKTREE_STATUS_FORMAT.JSON,
          worktreePath,
          absentPath,
        ],
        {},
        layout.container,
      );

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([
        { worktree: worktreeClaimName(worktreePath), status: OCCUPANCY_STATUS.UNCLAIMED },
      ]);
    });
  });

  it("ALWAYS: a live holder reads occupied when claim and status run under different timezones", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(prefix, async (worktreesDir) => {
        const worktreePath = layout.worktree(worktreeName);
        const claim = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.CLAIM,
            WORKTREE_CLI.SESSION_ID_FLAG,
            sessionId,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          { [CONTROLLING_PID_ENV]: String(process.pid), TZ: "America/New_York" },
          worktreePath,
        );
        expect(claim.exitCode).toBe(0);

        const status = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            ".",
            WORKTREE_CLI.FORMAT_FLAG,
            WORKTREE_STATUS_FORMAT.JSON,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          { [CONTROLLING_PID_ENV]: String(process.pid), TZ: "Asia/Tokyo" },
          worktreePath,
        );

        expect(status.exitCode).toBe(0);
        const parsed = JSON.parse(status.stdout) as { status: string };
        expect(parsed.status).toBe(OCCUPANCY_STATUS.OCCUPIED);
      });
    });
  });

  it("ALWAYS: a subcommand exits non-zero with a stderr diagnostic when its operation fails", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runWorktreeCli(
        [WORKTREE_CLI.COMMAND, WORKTREE_CLI.CLAIM, WORKTREE_CLI.WORKTREES_DIR_FLAG, worktreesDir],
        {},
        worktreesDir,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });
});
