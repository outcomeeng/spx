import {
  assertConfiguredHookNameParsing,
  assertObsoletePortableHooksAreRemoved,
  assertPortableHookInstallWritesExecutableShims,
  assertPortableShimMarkerRecognition,
  assertRenderedHookHonorsExplicitOverrideFirst,
  assertRenderedHookProvisionsWithFrozenInstall,
  assertRenderedHookUsesWorktreeResolution,
} from "@testing/harnesses/precommit/hook-install";
import { describe, expect, it } from "vitest";

describe("portable lefthook hook installation", () => {
  it("maps only configured Git hook sections from lefthook config", () => {
    assertConfiguredHookNameParsing();
  });

  it("renders hooks that resolve lefthook from the invoking worktree at runtime", () => {
    assertRenderedHookUsesWorktreeResolution();
  });

  it("renders hooks that honor the explicit lefthook override before other binaries", () => {
    assertRenderedHookHonorsExplicitOverrideFirst();
  });

  it("provisions dependencies with a frozen-lockfile install before running lefthook when no binary is reachable", () => {
    assertRenderedHookProvisionsWithFrozenInstall();
  });

  it("recognizes a portable shim by a marker present in every rendered template version", () => {
    assertPortableShimMarkerRecognition();
  });

  it("replaces lefthook-generated hooks with executable portable shims", async () => {
    await expect(assertPortableHookInstallWritesExecutableShims()).resolves.toBeUndefined();
  });

  it("removes obsolete portable shims without deleting handwritten hooks", async () => {
    await expect(assertObsoletePortableHooksAreRemoved()).resolves.toBeUndefined();
  });
});
