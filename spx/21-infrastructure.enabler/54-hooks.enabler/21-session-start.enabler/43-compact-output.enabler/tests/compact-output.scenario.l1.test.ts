import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
  type HookSessionStartEnv,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import type { RandomBytes } from "@/lib/atomic-file-write";
import { defaultGitDependencies } from "@/lib/git/root";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import { defaultMethodologyPackageFileSystem } from "@/lib/methodology/package-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  type CompactRecoveryPackageFixture,
  createRecordingCompactDirectiveResolver,
  withCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";
import { withWorktreePool, type WorktreePoolEnv } from "@testing/harnesses/worktree/harness";

interface CompactOutputScenarioInput {
  readonly claimRandomBytes: RandomBytes;
  readonly compactStdout: boolean;
  readonly env: HookSessionStartEnv;
  readonly envFile?: string;
  readonly resolveCompactDirective: (productDir: string) => ReturnType<typeof resolveCompactRecoveryDirective>;
}

function compactHookContent(env: WorktreePoolEnv): string {
  return JSON.stringify({
    [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
    [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.COMPACT,
  });
}

function fixtureDirectiveResolver(fixture: CompactRecoveryPackageFixture) {
  return () =>
    resolveCompactRecoveryDirective({
      productDir: fixture.productDir,
      packageDir: fixture.packageDir,
      fs: defaultMethodologyPackageFileSystem,
    });
}

async function runCompactOutputScenario(env: WorktreePoolEnv, input: CompactOutputScenarioInput) {
  return runSessionStartHook({
    claimRandomBytes: input.claimRandomBytes,
    compactStdout: input.compactStdout,
    content: compactHookContent(env),
    cwd: env.container,
    envFile: input.envFile ?? input.env[HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE],
    fs: env.fs,
    gitDeps: defaultGitDependencies,
    worktreesDir: env.worktreesDir,
    processTable: env.processTable,
    resolveCompactDirective: input.resolveCompactDirective,
    selfPid: env.holder.pid,
    env: input.env,
  });
}

describe("hook session-start compact output", () => {
  it("emits no hook stdout for the compact lifecycle source when compact stdout policy is disabled", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const envFileName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const recording = createRecordingCompactDirectiveResolver(
      sampleGeneratedValue(arbitraryCompactDirectiveText()),
    );

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      const envFile = join(env.container, envFileName);
      const result = await runCompactOutputScenario(env, {
        claimRandomBytes,
        compactStdout: false,
        resolveCompactDirective: recording.resolver,
        env: {
          [CONTROLLING_PID_ENV]: String(env.holder.pid),
          [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
          [HOOK_SESSION_START_ENV.CLAUDE_ENV_FILE]: envFile,
        },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.value.claimed).toBe(true);
      expect(result.value.stdout).toHaveLength(0);
    });
  });

  it("emits the resolved compact-recovery directive bytes when compact stdout policy is enabled", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

    await withCompactRecoveryPackage(
      { directiveText, variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED },
      async (fixture) => {
        await withWorktreePool({ worktreeName, holder }, async (env) => {
          const result = await runCompactOutputScenario(env, {
            claimRandomBytes,
            compactStdout: true,
            resolveCompactDirective: fixtureDirectiveResolver(fixture),
            env: {
              [CONTROLLING_PID_ENV]: String(env.holder.pid),
              [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
            },
            envFile: join(env.container, sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.envFileName())),
          });

          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error(result.error);
          expect(result.value.claimed).toBe(true);
          expect(result.value.stdout).toBe(fixture.directiveText);
        });
      },
    );
  });
});
