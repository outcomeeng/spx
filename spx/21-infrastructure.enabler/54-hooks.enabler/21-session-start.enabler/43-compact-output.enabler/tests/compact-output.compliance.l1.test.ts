import { describe, expect, it } from "vitest";

import { HOOK_SESSION_START_SOURCE } from "@/domains/hooks/session-start";
import { arbitraryCompactDirectiveText } from "@testing/generators/hooks/session-start";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  createRecordingCompactDirectiveResolver,
  runCompactOutputHookCase,
} from "@testing/harnesses/hooks/compact-recovery";

describe("hook session-start compact stdout boundary", () => {
  it("emits no hook stdout for the compact lifecycle source when the policy is false", async () => {
    const recording = createRecordingCompactDirectiveResolver(sampleGeneratedValue(arbitraryCompactDirectiveText()));

    const result = await runCompactOutputHookCase({
      compactStdout: false,
      source: HOOK_SESSION_START_SOURCE.COMPACT,
      resolveCompactDirective: recording.resolver,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.stdout).toHaveLength(0);
  });

  it("never invokes directive resolution for a compact invocation whose policy is false", async () => {
    const recording = createRecordingCompactDirectiveResolver(sampleGeneratedValue(arbitraryCompactDirectiveText()));

    await runCompactOutputHookCase({
      compactStdout: false,
      source: HOOK_SESSION_START_SOURCE.COMPACT,
      resolveCompactDirective: recording.resolver,
    });

    expect(recording.invocations).toHaveLength(0);
  });

  it("never invokes directive resolution for a non-compact lifecycle source whose policy is true", async () => {
    const recording = createRecordingCompactDirectiveResolver(sampleGeneratedValue(arbitraryCompactDirectiveText()));

    const result = await runCompactOutputHookCase({
      compactStdout: true,
      source: HOOK_SESSION_START_SOURCE.STARTUP,
      resolveCompactDirective: recording.resolver,
    });

    expect(recording.invocations).toHaveLength(0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.stdout).toHaveLength(0);
  });
});
