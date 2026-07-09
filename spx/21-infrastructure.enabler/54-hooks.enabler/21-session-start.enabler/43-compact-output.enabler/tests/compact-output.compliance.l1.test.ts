import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { defaultGitDependencies } from "@/lib/git/root";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

function hookContentWithSource(env: WorktreePoolEnv, source: string): string {
  return JSON.stringify({
    [HOOK_SESSION_START_PAYLOAD.SOURCE]: source,
    [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
  });
}

async function expectNoHookStdoutFor(renderContent: (env: WorktreePoolEnv) => string): Promise<void> {
  const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
  const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
  const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
  const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

  await withWorktreePool({ worktreeName, holder }, async (env) => {
    const envFile = join(env.container, envFileName);
    const result = await runSessionStartHook({
      claimRandomBytes,
      compactStdout: false,
      content: renderContent(env),
      cwd: env.container,
      envFile,
      fs: env.fs,
      gitDeps: defaultGitDependencies,
      worktreesDir: env.worktreesDir,
      processTable: env.processTable,
      selfPid: env.holder.pid,
      env: {
        [CONTROLLING_PID_ENV]: String(env.holder.pid),
        [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: threadId,
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.stdout).toHaveLength(0);
  });
}

describe("hook session-start compact stdout boundary", () => {
  it("emits no hook stdout for the compact lifecycle source", async () => {
    await expectNoHookStdoutFor((env) => hookContentWithSource(env, HOOK_SESSION_START_SOURCE.COMPACT));
  });
});
