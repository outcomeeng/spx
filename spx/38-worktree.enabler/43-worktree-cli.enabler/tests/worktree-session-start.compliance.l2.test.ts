import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import {
  WORKTREE_SESSION_START_CLAIMED,
  WORKTREE_SESSION_START_ENV,
  WORKTREE_SESSION_START_ENV_FILE,
  WORKTREE_SESSION_START_PAYLOAD,
} from "@/domains/worktree/session-start";
import { WORKTREE_CLI } from "@/interfaces/cli/worktree";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withWorktreeLayoutEnv } from "@testing/harnesses/worktree-layout/worktree-layout";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

describe("worktree session-start CLI compliance", () => {
  it("ALWAYS: session-start reads hook stdin, writes no stdout, exits 0, claims once, and writes the hook env file", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withWorktreeLayoutEnv({ bare: true, worktrees: [{ name: worktreeName }] }, async (layout) => {
      await withTempDir(prefix, async (worktreesDir) => {
        const worktreePath = layout.worktree(worktreeName);
        const envFile = join(worktreesDir, envFileName);
        const result = await runWorktreeCli(
          [WORKTREE_CLI.COMMAND, WORKTREE_CLI.SESSION_START, WORKTREE_CLI.WORKTREES_DIR_FLAG, worktreesDir],
          {
            [CONTROLLING_PID_ENV]: String(process.pid),
            [WORKTREE_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
          },
          worktreePath,
          JSON.stringify({
            [WORKTREE_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
            [WORKTREE_SESSION_START_PAYLOAD.CWD]: worktreePath,
          }),
        );

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toHaveLength(0);

        const envContent = await readFile(envFile, WORKTREE_SESSION_START_ENV_FILE.ENCODING);
        expect(envContent).toContain(
          `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.CLAUDE_SESSION_ID}=${sessionId}`,
        );
        expect(envContent).toContain(
          `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${WORKTREE_SESSION_START_CLAIMED.TRUE}`,
        );
      });
    });
  });
});
