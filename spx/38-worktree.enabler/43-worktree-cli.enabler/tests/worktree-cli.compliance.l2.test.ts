import { readdir } from "node:fs/promises";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

import { WORKTREE_STATUS_FORMAT } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { OCCUPANCY_CLAIM, OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { CLI_PATH, NODE_EXECUTABLE } from "@testing/harnesses/constants";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

async function runSpx(
  args: readonly string[],
  env: Readonly<Record<string, string>>,
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await execa(NODE_EXECUTABLE, [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, ...env },
    reject: false,
  });
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode ?? 1 };
}

describe("worktree CLI compliance", () => {
  it("ALWAYS: a successful claim writes nothing to stdout and exits 0", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runSpx(
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
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runSpx(
        [
          WORKTREE_CLI.COMMAND,
          WORKTREE_CLI.STATUS,
          worktreeName,
          WORKTREE_CLI.FORMAT_FLAG,
          WORKTREE_STATUS_FORMAT.JSON,
          WORKTREE_CLI.WORKTREES_DIR_FLAG,
          worktreesDir,
        ],
        {},
        worktreesDir,
      );

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout) as { status: string };
      expect(parsed.status).toBe(OCCUPANCY_STATUS.UNCLAIMED);
    });
  });

  it("ALWAYS: a subcommand exits non-zero with a stderr diagnostic when its operation fails", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runSpx(
        [WORKTREE_CLI.COMMAND, WORKTREE_CLI.CLAIM, WORKTREE_CLI.WORKTREES_DIR_FLAG, worktreesDir],
        {},
        worktreesDir,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });
});
