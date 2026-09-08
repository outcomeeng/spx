import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import {
  formatCompactRecoveryEntryAbsentError,
  formatFoundationManifestInvalidError,
  formatFoundationManifestUnreadableError,
  formatFoundationResourceUnreadableError,
  FOUNDATION_MANIFEST_NOT_JSON_ERROR,
} from "@/lib/methodology/foundation-manifest";
import { formatMethodologyLineMissingError } from "@/lib/methodology/tree";
import { defaultMethodologyTreeFileSystem } from "@/lib/methodology/tree-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  type CompactRecoveryFixtureVariant,
  type CompactRecoveryTreeFixture,
  runCompactOutputHookCase,
  withCompactRecoveryTree,
} from "@testing/harnesses/hooks/compact-recovery";

interface UnresolvedDirectiveRow {
  readonly variant: CompactRecoveryFixtureVariant;
  readonly expectedDiagnostic: (fixture: CompactRecoveryTreeFixture) => string;
}

function unresolvedDirectiveRows(): readonly UnresolvedDirectiveRow[] {
  return [
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.LINE_UNSHIPPED,
      expectedDiagnostic: (fixture) => formatMethodologyLineMissingError(fixture.version, fixture.line, []),
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
    {
      variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOURCE_INVALID_UTF8,
      expectedDiagnostic: (fixture) => formatFoundationResourceUnreadableError(fixture.entryPath, fixture.manifestPath),
    },
  ];
}

describe("compact directive resolution failure mapping", () => {
  it.each(unresolvedDirectiveRows())(
    "maps the $variant condition to no compact-source stdout, its step diagnostic, and successful completion",
    async (row) => {
      const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

      await withCompactRecoveryTree({ directiveText, variant: row.variant }, async (fixture) => {
        const result = await runCompactOutputHookCase({
          compactStdout: true,
          source: HOOK_SESSION_START_SOURCE.COMPACT,
          resolveCompactDirective: () =>
            resolveCompactRecoveryDirective({
              treeRoot: fixture.treeRoot,
              methodology: fixture.methodology,
              codingAgent: fixture.codingAgent,
              fs: defaultMethodologyTreeFileSystem,
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
