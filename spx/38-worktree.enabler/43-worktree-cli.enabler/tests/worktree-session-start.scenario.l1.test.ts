import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { sessionStartCommand } from "@/commands/worktree/index";
import { CONTROLLING_PID_ENV, CONTROLLING_PROCESS_ERROR } from "@/domains/worktree/controlling-process";
import { readClaim } from "@/domains/worktree/occupancy-store";
import {
  WORKTREE_SESSION_START_CLAIMED,
  WORKTREE_SESSION_START_ENV,
  WORKTREE_SESSION_START_ENV_FILE,
  WORKTREE_SESSION_START_PAYLOAD,
} from "@/domains/worktree/session-start";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

describe("worktree session-start handler", () => {
  it("writes one claim and the hook env exports from a SessionStart payload", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await sessionStartCommand({
        content: JSON.stringify({
          [WORKTREE_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [WORKTREE_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
        cwd: env.container,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        env: {
          [CONTROLLING_PID_ENV]: String(holder.pid),
          [WORKTREE_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(true);

      const claimName = worktreeClaimName(basename(env.worktreePath));
      const claim = await readClaim(env.worktreesDir, claimName);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({
        sessionId,
        host: holder.host,
        pid: holder.pid,
        startedAt: holder.startedAt,
      });

      const envContent = await readFile(envFile, WORKTREE_SESSION_START_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.CLAUDE_SESSION_ID}=${sessionId}`,
      );
      expect(envContent).toContain(
        `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.CLAUDE_PROJECT_DIR}='${
          env.worktreePath
        }'`,
      );
      expect(envContent).toContain(
        `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.PROJECT_DIR}='${
          env.worktreePath
        }'`,
      );
      expect(envContent).toContain(
        `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${WORKTREE_SESSION_START_CLAIMED.TRUE}`,
      );
    });
  });

  it("uses CODEX_THREAD_ID when the hook payload has no session id", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await sessionStartCommand({
        content: JSON.stringify({ [WORKTREE_SESSION_START_PAYLOAD.CWD]: env.worktreePath }),
        cwd: env.container,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        env: {
          [CONTROLLING_PID_ENV]: String(holder.pid),
          [WORKTREE_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
          [WORKTREE_SESSION_START_ENV.CODEX_THREAD_ID]: threadId,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(threadId);

      const claimName = worktreeClaimName(basename(env.worktreePath));
      const claim = await readClaim(env.worktreesDir, claimName);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(threadId);

      const envContent = await readFile(envFile, WORKTREE_SESSION_START_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${WORKTREE_SESSION_START_ENV_FILE.EXPORT_PREFIX}${WORKTREE_SESSION_START_ENV.CLAUDE_SESSION_ID}=${threadId}`,
      );
    });
  });

  it("fails without writing hook env exports when the claim cannot resolve a holder", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await sessionStartCommand({
        content: JSON.stringify({
          [WORKTREE_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [WORKTREE_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
        cwd: env.container,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        env: {
          [WORKTREE_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected session-start claim failure");
      expect(result.error).toBe(CONTROLLING_PROCESS_ERROR.UNRESOLVED);
      await expect(readFile(envFile, WORKTREE_SESSION_START_ENV_FILE.ENCODING)).rejects.toThrow();
    });
  });
});
