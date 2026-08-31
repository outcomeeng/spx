import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import { defaultMethodologyPackageFileSystem } from "@/lib/methodology/package-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  runCompactOutputHookCase,
  withCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";

describe("compact directive byte conformance", () => {
  it("emits compact-source stdout equal to the exact bytes of the manifest-named compact-recovery resource", async () => {
    const directiveText = sampleGeneratedValue(arbitraryCompactDirectiveText());

    await withCompactRecoveryPackage(
      { directiveText, variant: COMPACT_RECOVERY_FIXTURE_VARIANT.RESOLVED },
      async (fixture) => {
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
        expect(result.value.stdout).toBe(fixture.directiveText);
      },
    );
  });
});
