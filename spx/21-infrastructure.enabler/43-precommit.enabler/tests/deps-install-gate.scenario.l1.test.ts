import { describe, expect, it } from "vitest";

import {
  assertDiffProbeUsesWorkingDirectory,
  assertFailureExitCodeWhenDiffProbeExitsNonZero,
  assertFailureExitCodeWhenDiffProbeThrows,
  assertInstallExitCodeWhenDiffListsLockfile,
  assertSkipExitCodeWhenDiffEmpty,
} from "@testing/harnesses/precommit/deps-install-gate";

describe("resolveDepsInstallGateExitCode", () => {
  it("returns the install exit code when the lockfile-scoped diff lists the lockfile", async () => {
    await expect(assertInstallExitCodeWhenDiffListsLockfile()).resolves.toBeUndefined();
  });

  it("returns the skip exit code when the lockfile-scoped diff is empty", async () => {
    await expect(assertSkipExitCodeWhenDiffEmpty()).resolves.toBeUndefined();
  });

  it("returns the failure exit code when the lockfile-diff probe throws", async () => {
    await expect(assertFailureExitCodeWhenDiffProbeThrows()).resolves.toBeUndefined();
  });

  it("returns the failure exit code when the lockfile-diff probe resolves a non-zero exit code", async () => {
    await expect(assertFailureExitCodeWhenDiffProbeExitsNonZero()).resolves.toBeUndefined();
  });

  it("runs the lockfile-diff probe in the given working directory", async () => {
    await expect(assertDiffProbeUsesWorkingDirectory()).resolves.toBeUndefined();
  });
});
