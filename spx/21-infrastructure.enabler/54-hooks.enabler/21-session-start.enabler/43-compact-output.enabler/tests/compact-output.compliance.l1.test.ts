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
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { createRecordingCompactDirectiveResolver } from "@testing/harnesses/hooks/compact-recovery";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

interface CompactBoundaryInput {
  readonly compactStdout: boolean;
  readonly source: string;
}

async function runCompactBoundaryCase(input: CompactBoundaryInput) {
  const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
  const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
  const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
  const threadId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
  const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
  const recording = createRecordingCompactDirectiveResolver(sampleGeneratedValue(arbitraryCompactDirectiveText()));

  let stdout: string | undefined;
  await withWorktreePool({ worktreeName, holder }, async (env: WorktreePoolEnv) => {
    const result = await runSessionStartHook({
      claimRandomBytes,
      compactStdout: input.compactStdout,
      content: JSON.stringify({
        [HOOK_SESSION_START_PAYLOAD.SOURCE]: input.source,
        [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
      }),
      cwd: env.container,
      envFile: join(env.container, envFileName),
      fs: env.fs,
      gitDeps: defaultGitDependencies,
      worktreesDir: env.worktreesDir,
      processTable: env.processTable,
      resolveCompactDirective: recording.resolver,
      selfPid: env.holder.pid,
      env: {
        [CONTROLLING_PID_ENV]: String(env.holder.pid),
        [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: threadId,
      },
    });

    if (!result.ok) throw new Error(result.error);
    stdout = result.value.stdout;
  });
  return { invocations: recording.invocations, stdout };
}

describe("hook session-start compact stdout boundary", () => {
  it("emits no hook stdout for the compact lifecycle source when the policy is false", async () => {
    const evidence = await runCompactBoundaryCase({
      compactStdout: false,
      source: HOOK_SESSION_START_SOURCE.COMPACT,
    });

    expect(evidence.stdout).toHaveLength(0);
  });

  it("never invokes directive resolution for a compact invocation whose policy is false", async () => {
    const evidence = await runCompactBoundaryCase({
      compactStdout: false,
      source: HOOK_SESSION_START_SOURCE.COMPACT,
    });

    expect(evidence.invocations).toHaveLength(0);
  });

  it("never invokes directive resolution for a non-compact lifecycle source whose policy is true", async () => {
    const evidence = await runCompactBoundaryCase({
      compactStdout: true,
      source: HOOK_SESSION_START_SOURCE.STARTUP,
    });

    expect(evidence.invocations).toHaveLength(0);
    expect(evidence.stdout).toHaveLength(0);
  });
});
