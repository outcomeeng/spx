import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOOK_COMPACT_FOUNDATION_DIRECTIVE,
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { defaultGitDependencies } from "@/git/root";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

function hookContentWithSource(env: WorktreePoolEnv, source: string): string {
  return JSON.stringify({
    [HOOK_SESSION_START_PAYLOAD.SOURCE]: source,
    [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
  });
}

function hookEnvWithHolder(env: WorktreePoolEnv, envFile: string): HookSessionStartEnv {
  return {
    [CONTROLLING_PID_ENV]: String(env.holder.pid),
    [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
  };
}

describe("hook session-start compact-directive boundary", () => {
  it.each(
    Object.values(HOOK_SESSION_START_SOURCE).filter((source) => source !== HOOK_SESSION_START_SOURCE.COMPACT),
  )(
    "emits no foundation re-anchor directive for the %s lifecycle source",
    async (source) => {
      const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
      const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
      const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
      const claimWriteToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

      await withWorktreePool({ worktreeName, holder }, async (env) => {
        const envFile = join(env.container, envFileName);
        const result = await runSessionStartHook({
          claimWriteToken,
          content: hookContentWithSource(env, source),
          cwd: env.container,
          fs: env.fs,
          gitDeps: defaultGitDependencies,
          worktreesDir: env.worktreesDir,
          processTable: env.processTable,
          selfPid: env.holder.pid,
          env: hookEnvWithHolder(env, envFile),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.value.stdout).not.toContain(HOOK_COMPACT_FOUNDATION_DIRECTIVE);
      });
    },
  );
});
