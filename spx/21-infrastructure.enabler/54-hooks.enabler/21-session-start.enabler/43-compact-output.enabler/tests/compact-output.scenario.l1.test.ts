import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  createRecordingCompactDirectiveResolver,
  runCompactOutputHookCase,
  withResolvedCompactOutputCase,
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
    await withResolvedCompactOutputCase(
      sampleGeneratedValue(arbitraryCompactDirectiveText()),
      (result, fixture) => {
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error);
        expect(result.value.claimed).toBe(true);
        expect(result.value.stdout).toBe(fixture.directiveText);
      },
    );
  });
});
