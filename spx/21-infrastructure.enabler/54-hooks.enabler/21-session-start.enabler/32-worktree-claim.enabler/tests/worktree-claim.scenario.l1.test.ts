import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV, CONTROLLING_PROCESS_ERROR } from "@/domains/worktree/controlling-process";
import { readClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { defaultGitDependencies } from "@/git/root";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

interface SessionStartHookScenarioInput {
  readonly claimWriteToken: string;
  readonly content: string;
  readonly env: HookSessionStartEnv;
  readonly envFile?: string;
}

function hookContent(env: WorktreePoolEnv, sessionId?: string): string {
  return JSON.stringify({
    ...(sessionId === undefined ? {} : { [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId }),
    [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
  });
}

function hookEnvFilePath(env: WorktreePoolEnv, envFileName: string): string {
  return join(env.container, envFileName);
}

function hookEnvWithHolder(
  env: WorktreePoolEnv,
  envFile: string,
  overlay: HookSessionStartEnv = {},
): HookSessionStartEnv {
  return {
    [CONTROLLING_PID_ENV]: String(env.holder.pid),
    [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
    ...overlay,
  };
}

async function runSessionStartHookScenario(env: WorktreePoolEnv, input: SessionStartHookScenarioInput) {
  return runSessionStartHook({
    claimWriteToken: input.claimWriteToken,
    compactStdout: false,
    content: input.content,
    cwd: env.container,
    envFile: input.envFile ?? input.env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE],
    fs: env.fs,
    gitDeps: defaultGitDependencies,
    worktreesDir: env.worktreesDir,
    processTable: env.processTable,
    selfPid: env.holder.pid,
    env: input.env,
  });
}

async function readWorktreeClaim(env: WorktreePoolEnv) {
  return readClaim(env.worktreesDir, worktreeClaimName(basename(env.worktreePath)), { fs: env.fs });
}

async function readHookEnvFile(envFile: string): Promise<string> {
  return readFile(envFile, HOOK_ENV_FILE.ENCODING);
}

async function seedHookEnvFile(envFile: string, threadId: string): Promise<string> {
  const existingExport = `${HOOK_ENV_FILE.EXPORT_PREFIX}${HOOK_SESSION_START_ENV.CODEX_THREAD_ID}=${threadId}\n`;
  await writeFile(envFile, existingExport, HOOK_ENV_FILE.ENCODING);
  return existingExport;
}

function expectHookEnvExport(envContent: string, name: string, value: string): void {
  expect(envContent).toContain(`${HOOK_ENV_FILE.EXPORT_PREFIX}${name}=${value}`);
}

function expectNoHookEnvExport(envContent: string, name: string): void {
  expect(envContent).not.toContain(`${HOOK_ENV_FILE.EXPORT_PREFIX}${name}=`);
}

describe("hook session-start worktree claim", () => {
  it("writes one claim and exports the claim path from a session-start payload", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const existingExport = await seedHookEnvFile(envFile, sessionId);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env, sessionId),
        env: hookEnvWithHolder(env, envFile),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(true);
      expect(result.value.claimPath).toBeDefined();
      expect(result.value.diagnostics).toEqual([]);
      expect(result.value.stdout).toHaveLength(0);
      if (result.value.claimPath === undefined) throw new Error("expected claim path");

      const claim = await readWorktreeClaim(env);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value).toEqual({
        sessionId,
        host: holder.host,
        pid: holder.pid,
        startedAt: holder.startedAt,
      });

      const envContent = await readHookEnvFile(envFile);
      expect(envContent.startsWith(existingExport)).toBe(true);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, sessionId);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH, `'${result.value.claimPath}'`);
    });
  });

  it("writes project exports without a claim path when no session identity is available", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env),
        env: hookEnvWithHolder(env, envFile),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(false);
      expect(result.value.claimPath).toBeUndefined();
      expect(result.value.sessionId).toBeUndefined();

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.PROJECT_DIR, `'${env.worktreePath}'`);
      expectNoHookEnvExport(envContent, HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH);
    });
  });

  it("degrades without exporting a claim path when the claim cannot resolve a holder", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env, sessionId),
        env: {
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(false);
      expect(result.value.claimPath).toBeUndefined();
      expect(result.value.diagnostics).toContain(CONTROLLING_PROCESS_ERROR.UNRESOLVED);

      const envContent = await readHookEnvFile(envFile);
      expectNoHookEnvExport(envContent, HOOK_SESSION_START_ENV.SPX_WORKTREE_CLAIM_PATH);
    });
  });
});
