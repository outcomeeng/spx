import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { METHODOLOGY_SECTION } from "@/config/methodology";
import { HOOK_SESSION_START_ENV, HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CONFIG_ERROR_PREFIX } from "@/interfaces/hooks/cli-runner";
import { FOUNDATION_MANIFEST_FIELDS, METHODOLOGY_CODING_AGENT } from "@/lib/methodology";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  runCompactSessionStartCli,
  shippedCompactRecoveryText,
  shippedMethodologyVersion,
  shippedTreeRelativeDir,
  withCompactSessionStartCliEnv,
  writeCodexCompactStdoutConfig,
  writeMalformedMethodologyConfig,
  writeMethodologyOnlyConfig,
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

  it("resolves the Claude Code compact directive against spx's shipped tree for the product's declared version", async () => {
    await withCompactSessionStartCliEnv(async (env) => {
      const version = await shippedMethodologyVersion();
      await writeMethodologyOnlyConfig(env.worktreePath, version.text);
      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: "",
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: env.envFile,
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      // The outcome follows the shipped manifest: the resource's exact bytes
      // when it names a compact-recovery entry, otherwise silence with the
      // absent entry and the resolved tree named on stderr.
      const directive = await shippedCompactRecoveryText(version.line, METHODOLOGY_CODING_AGENT.CLAUDE);
      if (directive === undefined) {
        expect(result.stdout).toHaveLength(0);
        expect(result.stderr).toContain(FOUNDATION_MANIFEST_FIELDS.COMPACT_RECOVERY);
        expect(result.stderr).toContain(shippedTreeRelativeDir(version.line, METHODOLOGY_CODING_AGENT.CLAUDE));
      } else {
        expect(result.stdout).toBe(directive);
      }
    });
  });

  it("keeps process stdout empty with a diagnostic when the methodology configuration fails to resolve", async () => {
    await withCompactSessionStartCliEnv(async (env) => {
      await writeMalformedMethodologyConfig(env.worktreePath);
      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: "",
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: env.envFile,
        },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
      expect(result.stderr).toContain(METHODOLOGY_SECTION);
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

  it("loads compact stdout policy and the methodology declaration from the product root for a nested hook invocation", async () => {
    const nestedDirectoryName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withCompactSessionStartCliEnv(async (env) => {
      const nestedInvocationDir = join(env.worktreePath, nestedDirectoryName);
      await mkdir(nestedInvocationDir);
      const version = await shippedMethodologyVersion();
      await writeCodexCompactStdoutConfig(env.worktreePath, true, version.text);

      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
        invocationDir: nestedInvocationDir,
      });

      expect(result.exitCode, result.stderr).toBe(0);
      const directive = await shippedCompactRecoveryText(version.line, METHODOLOGY_CODING_AGENT.CODEX);
      if (directive === undefined) {
        expect(result.stdout).toHaveLength(0);
        expect(result.stderr).toContain(shippedTreeRelativeDir(version.line, METHODOLOGY_CODING_AGENT.CODEX));
      } else {
        expect(result.stdout).toBe(directive);
      }
    });
  });

  it("loads compact stdout policy and the methodology declaration from the payload product root for an external hook invocation", async () => {
    // The distinct pair keeps the outside directory from colliding with the deterministically sampled worktree name.
    const [, outsideDirectoryName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());

    await withCompactSessionStartCliEnv(async (env) => {
      const externalInvocationDir = join(env.worktreePath, "..", outsideDirectoryName);
      await mkdir(externalInvocationDir);
      const version = await shippedMethodologyVersion();
      await writeCodexCompactStdoutConfig(env.worktreePath, true, version.text);

      const result = await runCompactSessionStartCli(env, HOOK_SESSION_START_SOURCE.COMPACT, {
        env: {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
        invocationDir: externalInvocationDir,
      });

      expect(result.exitCode, result.stderr).toBe(0);
      const directive = await shippedCompactRecoveryText(version.line, METHODOLOGY_CODING_AGENT.CODEX);
      if (directive === undefined) {
        expect(result.stdout).toHaveLength(0);
        expect(result.stderr).toContain(FOUNDATION_MANIFEST_FIELDS.COMPACT_RECOVERY);
        expect(result.stderr).toContain(shippedTreeRelativeDir(version.line, METHODOLOGY_CODING_AGENT.CODEX));
      } else {
        expect(result.stdout).toBe(directive);
      }
    });
  });
});
