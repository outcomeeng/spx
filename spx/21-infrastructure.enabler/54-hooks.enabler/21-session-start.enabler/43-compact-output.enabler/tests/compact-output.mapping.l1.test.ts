import { describe, expect, it } from "vitest";

import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION } from "@/config/methodology";
import { HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import {
  formatCompactRecoveryEntryAbsentError,
  formatFoundationManifestInvalidError,
  formatFoundationManifestUnreadableError,
  formatFoundationPackageUnconfiguredError,
  formatFoundationResourceUnreadableError,
  FOUNDATION_MANIFEST_NOT_JSON_ERROR,
} from "@/lib/methodology/foundation-manifest";
import { defaultMethodologyPackageFileSystem } from "@/lib/methodology/package-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  type CompactRecoveryFixtureVariant,
  type CompactRecoveryPackageFixture,
  runCompactOutputHookCase,
  withCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";

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
      const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

      await withCompactRecoveryPackage({ directiveText, variant: row.variant }, async (fixture) => {
        const result = await runCompactOutputHookCase({
          compactStdout: true,
          source: HOOK_SESSION_START_SOURCE.COMPACT,
          resolveCompactDirective: () =>
            resolveCompactRecoveryDirective({
              productDir: fixture.productDir,
              packageDir: fixture.packageDir,
              fs: defaultMethodologyPackageFileSystem,
            }),
        });

        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.value.stdout).toHaveLength(0);
        expect(result.value.diagnostics).toContain(row.expectedDiagnostic(fixture));
      });
    },
  );
});
