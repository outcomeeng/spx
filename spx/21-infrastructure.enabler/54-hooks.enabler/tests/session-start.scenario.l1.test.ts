import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOOK_COMPACT_FOUNDATION_ACTION,
  HOOK_ENV_FILE,
  HOOK_SESSION_START_CLAIMED,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV, CONTROLLING_PROCESS_ERROR } from "@/domains/worktree/controlling-process";
import { readClaim } from "@/domains/worktree/occupancy-store";
import { worktreeClaimName } from "@/domains/worktree/worktree-name";
import { defaultGitDependencies } from "@/git/root";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

const expectedCompactReasonLine = "Hook fired because the agent runtime reported source=compact.";
const expectedCompactStdoutLineCount = 4;
const compactDirectiveLineIndex = 2;

interface SessionStartHookScenarioInput {
  readonly claimWriteToken: string;
  readonly content: string;
  readonly env: HookSessionStartEnv;
}

function hookContent(env: WorktreePoolEnv, sessionId?: string, source?: string): string {
  return JSON.stringify({
    ...(sessionId === undefined ? {} : { [HOOK_SESSION_START_PAYLOAD.SESSION_ID]: sessionId }),
    ...(source === undefined ? {} : { [HOOK_SESSION_START_PAYLOAD.SOURCE]: source }),
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
    content: input.content,
    cwd: env.container,
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

function expectHookEnvClaimed(envContent: string, claimed: string): void {
  expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_WORKTREE_CLAIMED, claimed);
}

function expectCompactStdout(stdout: string): void {
  const lines = stdout.split("\n");
  expect(lines).toHaveLength(expectedCompactStdoutLineCount);
  expect(lines[0]).toBe(expectedCompactReasonLine);
  expect(lines[0]).toContain(HOOK_SESSION_START_PAYLOAD.SOURCE);
  expect(lines[0]).toContain(HOOK_SESSION_START_SOURCE.COMPACT);

  const directiveLine = lines[compactDirectiveLineIndex];
  const understandIndex = directiveLine.indexOf(HOOK_COMPACT_FOUNDATION_ACTION.UNDERSTAND);
  const contextualizeIndex = directiveLine.indexOf(HOOK_COMPACT_FOUNDATION_ACTION.CONTEXTUALIZE);
  expect(understandIndex).toBeGreaterThanOrEqual(0);
  expect(contextualizeIndex).toBeGreaterThan(understandIndex);
}

describe("hook session-start adapter", () => {
  it("writes one claim and the hook env exports from a session-start payload", async () => {
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
      expect(result.value.diagnostics).toEqual([]);
      expect(result.value.stdout).toHaveLength(0);

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
      expectHookEnvClaimed(envContent, HOOK_SESSION_START_CLAIMED.TRUE);
    });
  });

  it("emits the source reason and foundation re-anchor directive on the compact lifecycle source", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env, sessionId, HOOK_SESSION_START_SOURCE.COMPACT),
        env: hookEnvWithHolder(env, envFile),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expectCompactStdout(result.value.stdout);
    });
  });

  it("uses CODEX_THREAD_ID when the hook payload has no session id", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env),
        env: hookEnvWithHolder(env, envFile, { [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: threadId }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(threadId);

      const claim = await readWorktreeClaim(env);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(threadId);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, threadId);
    });
  });

  it("uses CLAUDE_SESSION_ID before CODEX_THREAD_ID when both env values exist", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const [claudeSessionId, codexThreadId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env),
        env: hookEnvWithHolder(env, envFile, {
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claudeSessionId,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexThreadId,
        }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(claudeSessionId);

      const claim = await readWorktreeClaim(env);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(claudeSessionId);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, claudeSessionId);
    });
  });

  it("uses the hook payload session id before CLAUDE_SESSION_ID when both exist", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const [payloadSessionId, envSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = hookEnvFilePath(env, envFileName);
      const result = await runSessionStartHookScenario(env, {
        claimWriteToken,
        content: hookContent(env, payloadSessionId),
        env: hookEnvWithHolder(env, envFile, { [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: envSessionId }),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.sessionId).toBe(payloadSessionId);

      const claim = await readWorktreeClaim(env);
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error(claim.error);
      expect(claim.value?.sessionId).toBe(payloadSessionId);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID, payloadSessionId);
    });
  });

  it("writes project exports when no session identity is available", async () => {
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
      expect(result.value.sessionId).toBeUndefined();

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.CLAUDE_PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvExport(envContent, HOOK_SESSION_START_ENV.PROJECT_DIR, `'${env.worktreePath}'`);
      expectHookEnvClaimed(envContent, HOOK_SESSION_START_CLAIMED.FALSE);
    });
  });

  it("degrades without blocking when the claim cannot resolve a holder", async () => {
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
      expect(result.value.diagnostics).toContain(CONTROLLING_PROCESS_ERROR.UNRESOLVED);

      const envContent = await readHookEnvFile(envFile);
      expectHookEnvClaimed(envContent, HOOK_SESSION_START_CLAIMED.FALSE);
    });
  });
});
