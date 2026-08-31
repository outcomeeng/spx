import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { resolveCompactRecoveryDirective } from "@/lib/methodology/compact-recovery";
import { defaultMethodologyPackageFileSystem } from "@/lib/methodology/package-resource";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  COMPACT_RECOVERY_FIXTURE_VARIANT,
  createRecordingCompactDirectiveResolver,
  runCompactOutputHookCase,
  withCompactRecoveryPackage,
} from "@testing/harnesses/hooks/compact-recovery";

describe("hook session-start compact output", () => {
  it("emits no hook stdout for the compact lifecycle source when compact stdout policy is disabled", async () => {
    const recording = createRecordingCompactDirectiveResolver(sampleGeneratedValue(arbitraryCompactDirectiveText()));

    const result = await runCompactOutputHookCase({
      compactStdout: false,
      source: HOOK_SESSION_START_SOURCE.COMPACT,
      resolveCompactDirective: recording.resolver,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.claimed).toBe(true);
    expect(result.value.stdout).toHaveLength(0);
  });

  it("emits the resolved compact-recovery directive bytes when compact stdout policy is enabled", async () => {
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
        expect(result.value.claimed).toBe(true);
        expect(result.value.stdout).toBe(fixture.directiveText);
      },
    );
  });
});
