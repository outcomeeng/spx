import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import {
  HOOK_SESSION_START_ENV,
  HOOK_SESSION_START_PAYLOAD,
  HOOK_SESSION_START_SOURCE,
} from "@/domains/hooks/session-start";
import { CONTROLLING_PID_ENV } from "@/domains/worktree/controlling-process";
import { runSessionStartHook } from "@/interfaces/hooks/session-start";
import { defaultGitDependencies } from "@/lib/git/root";
import {
  formatCompactRecoveryEntryAbsentError,
  resolveCompactRecoveryDirective,
} from "@/lib/methodology/compact-recovery";
import {
  formatFoundationManifestInvalidError,
  formatFoundationManifestUnreadableError,
  formatFoundationPackageUnconfiguredError,
  formatFoundationResourceUnreadableError,
  FOUNDATION_MANIFEST_NOT_JSON_ERROR,
} from "@/lib/methodology/foundation-manifest";
import { defaultMethodologyPackageFileSystem } from "@/lib/methodology/package-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  type CompactRecoveryFixtureVariant,
  type CompactRecoveryPackageFixture,
  withCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

interface UnresolvedDirectiveRow {
  readonly variant: CompactRecoveryFixtureVariant;
  readonly expectedDiagnostic: (fixture: CompactRecoveryPackageFixture) => string;
}

function unresolvedDirectiveRows(): readonly UnresolvedDirectiveRow[] {
  return [
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.PACKAGE_UNCONFIGURED,
      expectedDiagnostic: () =>
        formatFoundationPackageUnconfiguredError(METHODOLOGY_SECTION, METHODOLOGY_CONFIG_FIELDS.PACKAGE_DIR),
    },
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_ABSENT,
      expectedDiagnostic: (fixture) => formatFoundationManifestUnreadableError(fixture.manifestPath),
    },
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.MANIFEST_INVALID,
      expectedDiagnostic: (fixture) =>
        formatFoundationManifestInvalidError(fixture.manifestPath, FOUNDATION_MANIFEST_NOT_JSON_ERROR),
    },
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.ENTRY_ABSENT,
      expectedDiagnostic: (fixture) => formatCompactRecoveryEntryAbsentError(fixture.manifestPath),
    },
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_MISSING,
      expectedDiagnostic: (fixture) => formatFoundationResourceUnreadableError(fixture.entryPath, fixture.manifestPath),
    },
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_ESCAPING,
      expectedDiagnostic: (fixture) => formatFoundationResourceUnreadableError(fixture.entryPath, fixture.manifestPath),
    },
  ];
}

describe("compact directive resolution failure mapping", () => {
  it.each(unresolvedDirectiveRows())(
    "maps the $variant condition to no compact-source stdout, its step diagnostic, and successful completion",
    async (row) => {
      const worktreeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName());
      const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());
      const sessionId = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.sessionId());
      const claimRandomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
      const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

      await withCompactRecoveryPackage({ directiveText, variant: row.variant }, async (fixture) => {
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
          expect(result.value.stdout).toHaveLength(0);
          expect(result.value.diagnostics).toContain(row.expectedDiagnostic(fixture));
        });
      });
    },
  );
});
