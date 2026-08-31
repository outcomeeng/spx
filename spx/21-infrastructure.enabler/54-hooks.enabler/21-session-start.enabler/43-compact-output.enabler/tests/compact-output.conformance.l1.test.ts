import { describe, expect, it } from "vitest";

import {
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { defaultGitDependencies } from "@/lib/git/root";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import { defaultMethodologyPackageFileSystem } from "@/lib/methodology/package-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  withCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

describe("compact directive byte conformance", () => {
  it("emits compact-source stdout equal to the exact bytes of the manifest-named compact-recovery resource", async () => {
    const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
    const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
    const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

    await withCompactRecoveryPackage(
      { directiveText, variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED },
      async (fixture) => {
        await withWorktreePool({ worktreeName, holder }, async (env) => {
          const result = await runSessionStartHook({
            claimRandomBytes,
            compactStdout: true,
            content: JSON.stringify({
              [HOOK_SESSION_START_PAYLOAD.CWD]: env.worktreePath,
              [HOOK_SESSION_START_PAYLOAD.SOURCE]: HOOK_SESSION_START_SOURCE.COMPACT,
            }),
            cwd: env.container,
            fs: env.fs,
            gitDeps: defaultGitDependencies,
            worktreesDir: env.worktreesDir,
            processTable: env.processTable,
            resolveCompactDirective: () =>
              resolveCompactRecoveryDirective({
                productDir: fixture.productDir,
                packageDir: fixture.packageDir,
                fs: defaultMethodologyPackageFileSystem,
              }),
            selfPid: env.holder.pid,
            env: {
              [CONTROLLING_PID_ENV]: String(env.holder.pid),
              [HOOK_SESSION_START_ENV.CODEX_THREAD_ID]: sessionId,
            },
          });

          expect(result.ok).toBe(true);
          if (!result.ok) throw new Error(result.error);
          expect(result.value.stdout).toBe(fixture.directiveText);
        });
      },
    );
  });
});
