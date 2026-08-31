import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_ENV, HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CONFIG_ERROR_PREFIX } from "@/interfaces/hooks/cli-runner";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  runCompactSessionStartCli,
  withCompactSessionStartCliEnv,
  writeCodexCompactStdoutConfig,
  writeMethodologyOnlyConfig,
  writeResolvedCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";

describe("hook CLI compact stdout boundary", () => {
  it("keeps process stdout empty for Codex compact source under the default agent policy", async () => {
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withCompactSessionStartCliEnv(async (env) => {
      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("keeps process stdout empty when Codex and Claude Code agent markers are both present", async () => {
    const [claudeSessionId, codexThreadId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());

    await withCompactSessionStartCliEnv(async (env) => {
      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claudeSessionId,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexThreadId,
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("emits compact stdout for Claude Code compact source under the default agent policy", async () => {
    const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

    await withCompactSessionStartCliEnv(async (env) => {
      const methodologyPackage = await writeResolvedCompactRecoveryPackage(env.worktreePath, directiveText);
      await writeMethodologyOnlyConfig(env.worktreePath, methodologyPackage.packageDir);
      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: "",
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: env.envFile,
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe(directiveText);
    });
  });

  it("defaults to Codex compact stdout policy when no agent marker is present", async () => {
    await withCompactSessionStartCliEnv(async (env) => {
      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: "",
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: "",
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: "",
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("falls back to agent defaults and warns when compact stdout config is malformed", async () => {
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withCompactSessionStartCliEnv(async (env) => {
      await writeCodexCompactStdoutConfig(env.worktreePath, sessionId);

      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(HOOK_CONFIG_ERROR_PREFIX);
    });
  });

  it("loads compact stdout policy from the product root for a nested hook invocation", async () => {
    const nestedDirectoryName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

    await withCompactSessionStartCliEnv(async (env) => {
      const nestedInvocationDir = join(env.worktreePath, nestedDirectoryName);
      await mkdir(nestedInvocationDir);
      const methodologyPackage = await writeResolvedCompactRecoveryPackage(env.worktreePath, directiveText);
      await writeCodexCompactStdoutConfig(env.worktreePath, true, methodologyPackage.packageDir);

      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
        invocationDir: nestedInvocationDir,
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe(directiveText);
    });
  });

  it("loads compact stdout policy from the payload product root for an external hook invocation", async () => {
    // The distinct pair keeps the outside directory from colliding with the deterministically sampled worktree name.
    const [, outsideDirectoryName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

    await withCompactSessionStartCliEnv(async (env) => {
      const externalInvocationDir = join(env.worktreePath, "..", outsideDirectoryName);
      await mkdir(externalInvocationDir);
      const methodologyPackage = await writeResolvedCompactRecoveryPackage(env.worktreePath, directiveText);
      await writeCodexCompactStdoutConfig(env.worktreePath, true, methodologyPackage.packageDir);

      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
        invocationDir: externalInvocationDir,
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe(directiveText);
    });
  });
});
