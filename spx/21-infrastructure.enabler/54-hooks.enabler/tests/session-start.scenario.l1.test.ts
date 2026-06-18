import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONTROLLING_PID_ENV, CONTROLLING_PROCESS_ERROR } from "@/domains/worktree/controlling-process";
import { readClaim } from "@/domains/worktree/occupancy-store";
import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_CLAIMED,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
} from "@/domains/hooks/session-start";
import { defaultGitDependencies } from "@/git/root";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

describe("hook session-start adapter", () => {
  it("writes one claim and the hook env exports from a session-start payload", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartHook({
        claimWriteToken,
        content: JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
        cwd: env.container,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: {
          [CONTROLLING_PID_ENV]: String(holder.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(true);
      expect(result.value.diagnostics).toEqual([]);
      expect(result.value.stdout).toHaveLength(0);

      const claimName = worktreeClaimName(basename(env.worktreePath));
      const claim = await readClaim(env.worktreesDir, claimName, { fs: env.fs });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({
        sessionId,
        host: holder.host,
        pid: holder.pid,
        startedAt: holder.startedAt,
      });

      const envContent = await readFile(envFile, HOOK_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${sessionId}`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR}='${env.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.PROJECT_DIR}='${env.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${HOOK_SESSION_START_CLAIMED.TRUE}`,
      );
    });
  });

  it("uses CODEX_THREAD_ID when the hook payload has no session id", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartHook({
        claimWriteToken,
        content: JSON.stringify({ [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath }),
        cwd: env.container,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: {
          [CONTROLLING_PID_ENV]: String(holder.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: threadId,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(threadId);

      const claimName = worktreeClaimName(basename(env.worktreePath));
      const claim = await readClaim(env.worktreesDir, claimName, { fs: env.fs });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(threadId);

      const envContent = await readFile(envFile, HOOK_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID}=${threadId}`,
      );
    });
  });

  it("writes project exports when no session identity is available", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartHook({
        claimWriteToken,
        content: JSON.stringify({ [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath }),
        cwd: env.container,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: {
          [CONTROLLING_PID_ENV]: String(holder.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(false);
      expect(result.value.sessionId).toBeUndefined();

      const envContent = await readFile(envFile, HOOK_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR}='${env.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.PROJECT_DIR}='${env.worktreePath}'`,
      );
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${HOOK_SESSION_START_CLAIMED.FALSE}`,
      );
    });
  });

  it("degrades without blocking when the claim cannot resolve a holder", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartHook({
        claimWriteToken,
        content: JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId,
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
        }),
        cwd: env.container,
        fs: env.fs,
        gitDeps: defaultGitDependencies,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
        selfPid: holder.pid,
        env: {
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(false);
      expect(result.value.diagnostics).toContain(CONTROLLING_PROCESS_ERROR.UNRESOLVED);

      const envContent = await readFile(envFile, HOOK_ENV_FILE.ENCODING);
      expect(envContent).toContain(
        `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED}=${HOOK_SESSION_START_CLAIMED.FALSE}`,
      );
    });
  });
});
