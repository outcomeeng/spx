import { describe, it } from "vitest";

import {
  assertDirectoryOptionDeterminesEffectiveInvocationDirectory,
  assertInvocationDirectoryDeterminesEffectiveInvocationDirectory,
  assertNonWorktreeInvocationFallsBackWithWarning,
  assertProductDirectoryResolvesWorktreeRoot,
  assertSubdirectoryResolvesWorktreeRoot,
} from "@testing/harnesses/config/root-resolution";

describe("config CLI product root resolution", () => {
  it("returns the worktree root when invoked from the product directory", async () => {
    await assertProductDirectoryResolvesWorktreeRoot();
  });

  it("returns the worktree root when invoked from a subdirectory", async () => {
    await assertSubdirectoryResolvesWorktreeRoot();
  });

  it("uses the -C target as the effective invocation directory", () => {
    assertDirectoryOptionDeterminesEffectiveInvocationDirectory();
  });

  it("uses process.cwd() when -C is absent", () => {
    assertInvocationDirectoryDeterminesEffectiveInvocationDirectory();
  });

  it("falls back to the supplied invocation directory and emits a warning outside a worktree", async () => {
    await assertNonWorktreeInvocationFallsBackWithWarning();
  });
});
