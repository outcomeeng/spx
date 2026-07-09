import { mkdir, readdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";

import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import {
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  OCCUPANCY_STATUS,
  readClaim,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import {
  GIT_WORKTREE_LIST_PORCELAIN_ARGS,
  GIT_WORKTREE_PORCELAIN_BARE_LINE,
  GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE,
  GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX,
  GIT_WORKTREE_PORCELAIN_ROOT_PREFIX,
} from "@/lib/git/root";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { readGit } from "@testing/harnesses/git-test-constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

type JsonStatusEntry = {
  readonly worktree: string;
  readonly status: string;
};

function trimTrailingPathSeparators(value: string): string {
  return value.replace(/[\\/]+$/u, "");
}

function normalizeGitWorktreeRoot(value: string): string {
  return trimTrailingPathSeparators(value.trim());
}

async function expectedFreeStatusEntriesFromGitWorktreeList(cwd: string): Promise<readonly JsonStatusEntry[]> {
  const output = await readGit(cwd, GIT_WORKTREE_LIST_PORCELAIN_ARGS);
  const entries: JsonStatusEntry[] = [];
  const seenRoots = new Set<string>();
  for (const record of output.split("\n\n")) {
    const lines = record.split("\n");
    if (
      lines.includes(GIT_WORKTREE_PORCELAIN_BARE_LINE)
      || lines.some((line) =>
        line === GIT_WORKTREE_PORCELAIN_PRUNABLE_LINE
        || line.startsWith(GIT_WORKTREE_PORCELAIN_PRUNABLE_PREFIX)
      )
    ) {
      continue;
    }
    const worktreeLine = lines.find((line) => line.startsWith(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX));
    if (worktreeLine === undefined) continue;
    const worktreeRoot = normalizeGitWorktreeRoot(worktreeLine.slice(GIT_WORKTREE_PORCELAIN_ROOT_PREFIX.length));
    if (worktreeRoot.length === 0 || seenRoots.has(worktreeRoot)) continue;
    seenRoots.add(worktreeRoot);
    entries.push({
      worktree: worktreeClaimName(worktreeRoot),
      status: OCCUPANCY_STATUS.FREE,
    });
  }
  return entries;
}

function expectedFreeStatusEntriesFromWorktreePaths(
  worktreeRoots: readonly string[],
): readonly JsonStatusEntry[] {
  return worktreeRoots.map((worktreeRoot) => ({
    worktree: worktreeClaimName(worktreeRoot),
    status: OCCUPANCY_STATUS.FREE,
  }));
}

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

  it("ALWAYS: claim exits non-zero and preserves the live holder when the worktree is already claimed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const [firstSessionId, secondSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(prefix, async (worktreesDir) => {
        const worktreePath = layout.worktree(worktreeName);
        const first = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.CLAIM,
            WORKTREE_CLI.SESSION_ID_FLAG,
            firstSessionId,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          { [CONTROLLING_PID_ENV]: String(process.pid) },
          worktreePath,
        );
        expect(first.exitCode).toBe(0);

        const second = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.CLAIM,
            WORKTREE_CLI.SESSION_ID_FLAG,
            secondSessionId,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          { [CONTROLLING_PID_ENV]: String(process.pid) },
          worktreePath,
        );

        expect(second.exitCode).not.toBe(0);
        expect(second.stdout).toHaveLength(0);
        expect(second.stderr).toContain(OCCUPANCY_ERROR.CLAIM_HELD);
        const claim = await readClaim(worktreesDir, worktreeClaimName(worktreePath), {
          fs: defaultOccupancyFileSystem,
        });
        expect(claim.ok).toBe(true);
        if (!claim.ok) throw new Error(claim.error);
        expect(claim.value?.sessionId).toBe(firstSessionId);
      });
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
        expect(parsed.status).toBe(OCCUPANCY_STATUS.FREE);
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
          { worktree: worktreeClaimName(firstPath), status: OCCUPANCY_STATUS.FREE },
          { worktree: worktreeClaimName(secondPath), status: OCCUPANCY_STATUS.FREE },
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
        { worktree: worktreeClaimName(worktreePath), status: OCCUPANCY_STATUS.FREE },
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
        { worktree: worktreeClaimName(worktreePath), status: OCCUPANCY_STATUS.FREE },
      ]);
    });
  });

  it("ALWAYS: status --all --format json writes parseable records for every git-observed worktree", async () => {
    const [firstName, secondName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());

    await withWorktreeLayoutEnv(
      { bare: true, worktrees: [{ name: firstName }, { name: secondName }] },
      async (layout) => {
        await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (worktreesDir) => {
          const firstPath = layout.worktree(firstName);
          const result = await runWorktreeCli(
            [
              WORKTREE_CLI.COMMAND,
              WORKTREE_CLI.STATUS,
              WORKTREE_CLI.ALL_FLAG,
              WORKTREE_CLI.FORMAT_FLAG,
              WORKTREE_STATUS_FORMAT.JSON,
              WORKTREE_CLI.WORKTREES_DIR_FLAG,
              worktreesDir,
            ],
            {},
            firstPath,
          );

          expect(result.exitCode).toBe(0);
          const expected = await expectedFreeStatusEntriesFromGitWorktreeList(firstPath);
          const parsed = JSON.parse(result.stdout) as readonly JsonStatusEntry[];
          expect(parsed).toEqual(expected);
        });
      },
    );
  });

  it("ALWAYS: status --all --format json writes an array for a one-worktree repository", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix()), async (worktreesDir) => {
        const worktreePath = layout.worktree(worktreeName);
        const result = await runWorktreeCli(
          [
            WORKTREE_CLI.COMMAND,
            WORKTREE_CLI.STATUS,
            WORKTREE_CLI.ALL_FLAG,
            WORKTREE_CLI.FORMAT_FLAG,
            WORKTREE_STATUS_FORMAT.JSON,
            WORKTREE_CLI.WORKTREES_DIR_FLAG,
            worktreesDir,
          ],
          {},
          worktreePath,
        );

        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual(expectedFreeStatusEntriesFromWorktreePaths([worktreePath]));
      });
    });
  });

  it("ALWAYS: a live holder reads running when claim and status run under different timezones", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const [claimTimeZone, statusTimeZone] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctTimeZones());

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
          { [CONTROLLING_PID_ENV]: String(process.pid), TZ: claimTimeZone },
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
          { [CONTROLLING_PID_ENV]: String(process.pid), TZ: statusTimeZone },
          worktreePath,
        );

        expect(status.exitCode).toBe(0);
        expect(JSON.parse(status.stdout)).toEqual({
          worktree: worktreeClaimName(worktreePath),
          status: OCCUPANCY_STATUS.RUNNING,
          pid: process.pid,
          session: sessionId,
          host: expect.any(String),
        });
      });
    });
  });

  it("ALWAYS: a dead holder claim reads free through status --format json", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const startedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(prefix, async (worktreesDir) => {
        const worktreePath = layout.worktree(worktreeName);
        const write = await writeClaim(
          worktreesDir,
          worktreeClaimName(worktreePath),
          { sessionId, host: hostname(), pid: Number.MAX_SAFE_INTEGER, startedAt },
          { fs: defaultOccupancyFileSystem, randomBytes },
        );
        expect(write.ok).toBe(true);
        if (!write.ok) throw new Error(write.error);

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
          {},
          worktreePath,
        );

        expect(status.exitCode).toBe(0);
        expect(JSON.parse(status.stdout)).toEqual({
          worktree: worktreeClaimName(worktreePath),
          status: OCCUPANCY_STATUS.FREE,
        });
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
