import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOOK_ENV_FILE,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { resolveAgentSessionId } from "@/domains/session/agent-session";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import type { RandomBytes } from "@/lib/atomic-file-write";
import { defaultGitDependencies } from "@/lib/git/root";
import {
  samplePathUnsafeAgentSessionIdentity,
  sampleWhitespaceAgentSessionIdentity,
  SESSION_GENERATOR_ERROR,
} from "@testing/generators/session/session";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

interface SessionStartIdentityScenarioInput {
  readonly claimRandomBytes: RandomBytes;
  readonly content: string;
  readonly env: HookSessionStartEnv;
}

function hookContent(env: WorktreePoolEnv, sessionId?: string): string {
  return JSON.stringify({
    ...(sessionId === undefined ? {} : { [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId }),
    [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
  });
}

function hookEnvWithHolder(
  env: WorktreePoolEnv,
  envFile: string,
  overlay: HookSessionStartEnv,
): HookSessionStartEnv {
  return {
    [CONTROLLING_PID_ENV]: String(env.holder.pid),
    [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
    ...overlay,
  };
}

async function runSessionStartIdentityScenario(env: WorktreePoolEnv, input: SessionStartIdentityScenarioInput) {
  return runSessionStartHook({
    claimRandomBytes: input.claimRandomBytes,
    compactStdout: false,
    content: input.content,
    cwd: env.container,
    envFile: input.env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE],
    fs: env.fs,
    gitDeps: defaultGitDependencies,
    worktreesDir: env.worktreesDir,
    processTable: env.processTable,
    selfPid: env.holder.pid,
    env: input.env,
  });
}

async function readHookEnvFile(envFile: string): Promise<string> {
  return readFile(envFile, HOOK_ENV_FILE.ENCODING);
}

function expectHookEnvExport(envContent: string, name: string, value: string): void {
  expect(envContent).toContain(`${HOOK_ENV_FILE.EXPORT_PREFIX}${name}=${value}`);
}

describe("hook session-start session identity", () => {
  it("uses CODEX_THREAD_ID when the hook payload has no session id", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes,
        content: hookContent(env),
        env: hookEnvWithHolder(env, envFile, { [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: threadId }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(threadId);
      expect(result.value.claimed).toBe(true);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, threadId);
    });
  });

  it("normalizes a path-unsafe payload session id before exporting it", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const payloadSessionId = samplePathUnsafeAgentSessionIdentity();
    const normalizedSessionId = resolveAgentSessionId({ [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: payloadSessionId });
    if (normalizedSessionId === undefined) throw new Error(SESSION_GENERATOR_ERROR.EMPTY_IDENTITY_SAMPLE);
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes,
        content: hookContent(env, payloadSessionId),
        env: hookEnvWithHolder(env, envFile, {}),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(normalizedSessionId);
      expect(result.value.claimed).toBe(true);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, normalizedSessionId);
    });
  });

  it("uses CLAUDE_SESSION_ID before CODEX_THREAD_ID when both env values exist", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const [claudeSessionId, codexThreadId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes,
        content: hookContent(env),
        env: hookEnvWithHolder(env, envFile, {
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claudeSessionId,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexThreadId,
        }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(claudeSessionId);
      expect(result.value.claimed).toBe(true);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, claudeSessionId);
    });
  });

  it("uses CODEX_THREAD_ID when CLAUDE_SESSION_ID contains only whitespace", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const whitespaceSessionId = sampleWhitespaceAgentSessionIdentity();
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes,
        content: hookContent(env),
        env: hookEnvWithHolder(env, envFile, {
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: whitespaceSessionId,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: threadId,
        }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(threadId);
      expect(result.value.claimed).toBe(true);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, threadId);
    });
  });

  it("uses the hook payload session id before CLAUDE_SESSION_ID when both exist", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const [payloadSessionId, envSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runSessionStartIdentityScenario(env, {
        claimRandomBytes,
        content: hookContent(env, payloadSessionId),
        env: hookEnvWithHolder(env, envFile, { [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: envSessionId }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(payloadSessionId);
      expect(result.value.claimed).toBe(true);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, payloadSessionId);
    });
  });
});
