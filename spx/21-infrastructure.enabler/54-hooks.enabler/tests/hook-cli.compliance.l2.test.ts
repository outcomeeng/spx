import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_CLAIMED,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
} from "@/domains/hooks/session-start";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

describe("hook CLI compliance", () => {
  it("ALWAYS: hook run session-start reads hook stdin, writes no stdout, exits 0, claims once, and writes the hook env file", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withHookCliWorktreeEnv({ envFileName, prefix, worktreeName }, async (env) => {
      const result = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: env.envFile,
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);

      const envContent = await readFile(env.envFile, HOOK_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${sessionId}`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${HOOK_SESSION_START_CLAIMED.TRUE}`,
      );
    });
  });

  it("ALWAYS: hook run session-start writes the hook env file named by the CLI flag", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withHookCliWorktreeEnv({ envFileName, prefix, worktreeName }, async (env) => {
      const result = await runWorktreeCli(
        [
          HOOK_CLI.COMMAND,
          HOOK_CLI.RUN,
          HOOK_EVENT.SESSION_START,
          HOOK_CLI.ENV_FILE_FLAG,
          env.envFile,
          HOOK_CLI.WORKTREES_DIR_FLAG,
          env.worktreesDir,
        ],
        { [CONTROLLING_PID_ENV]: String(process.pid) },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);

      const envContent = await readFile(env.envFile, HOOK_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${sessionId}`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${HOOK_SESSION_START_CLAIMED.TRUE}`,
      );
    });
  });

  it("ALWAYS: an unknown hook event exits non-zero with a diagnostic", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const unknownEvent = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withTempDir(prefix, async (worktreesDir) => {
      const result = await runWorktreeCli(
        [HOOK_CLI.COMMAND, HOOK_CLI.RUN, unknownEvent, HOOK_CLI.WORKTREES_DIR_FLAG, worktreesDir],
        {},
        worktreesDir,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });
  });
});
