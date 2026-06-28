import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES } from "@/config/index";
import {
  AGENT_ENVIRONMENT_CONFIG_FIELDS,
  AGENT_ENVIRONMENT_SECTION,
  AGENT_RUNTIME,
} from "@/domains/agent-environment/config";
import {
  HOOK_COMPACT_FOUNDATION_DIRECTIVE,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { HOOK_CLI } from "@/interfaces/cli/hook";
import { HOOK_EVENT } from "@/interfaces/hooks/registry";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withHookCliWorktreeEnv } from "@testing/harnesses/hook-cli";
import { runWorktreeCli } from "@testing/harnesses/worktree/harness";

async function writeCodexCompactStdoutConfig(productDir: string): Promise<void> {
  await writeFile(
    join(productDir, CONFIG_FILENAMES.json),
    JSON.stringify({
      [AGENT_ENVIRONMENT_SECTION]: {
        [AGENT_ENVIRONMENT_CONFIG_FIELDS.RUNTIMES]: {
          [AGENT_RUNTIME.CODEX]: {
            [AGENT_ENVIRONMENT_CONFIG_FIELDS.HOOKS]: {
              [AGENT_ENVIRONMENT_CONFIG_FIELDS.SESSION_START]: {
                [AGENT_ENVIRONMENT_CONFIG_FIELDS.COMPACT_STDOUT]: true,
              },
            },
          },
        },
      },
    }),
  );
}

describe("hook CLI compact stdout boundary", () => {
  it("keeps process stdout empty for Codex compact source under the default runtime policy", async () => {
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
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.COMPACT,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("keeps process stdout empty when Codex and Claude Code runtime markers are both present", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const [claudeSessionId, codexThreadId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
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
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: claudeSessionId,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: codexThreadId,
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.COMPACT,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toHaveLength(0);
    });
  });

  it("emits compact stdout for Claude Code compact source under the default runtime policy", async () => {
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
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CLAUDE_SESSION_ID]: sessionId,
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: "",
        },
        env.worktreePath,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.COMPACT,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe(HOOK_COMPACT_FOUNDATION_DIRECTIVE);
    });
  });

  it("loads compact stdout policy from the product root for a nested hook invocation", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const nestedDirectoryName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());

    await withHookCliWorktreeEnv({ envFileName, prefix, worktreeName }, async (env) => {
      const nestedInvocationDir = join(env.worktreePath, nestedDirectoryName);
      await mkdir(nestedInvocationDir);
      await writeCodexCompactStdoutConfig(env.worktreePath);

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
        {
          [CONTROLLING_PID_ENV]: String(process.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
        },
        nestedInvocationDir,
        JSON.stringify({
          [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
          [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.COMPACT,
        }),
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe(HOOK_COMPACT_FOUNDATION_DIRECTIVE);
    });
  });
});
