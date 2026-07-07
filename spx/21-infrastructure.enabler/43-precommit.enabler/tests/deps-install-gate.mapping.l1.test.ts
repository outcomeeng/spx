import {
  assertBranchFlagMapping,
  assertBranchLockfileChangeInstalls,
  assertFileCheckoutSkipsWhenLockfileChanged,
  assertNullRefMapsToChangedLockfile,
  assertNullRefNonBranchCheckoutFacts,
  assertRealRefMapsToLockfileDiffPresence,
  assertUnchangedLockfileSkips,
} from "@testing/harnesses/precommit/deps-install-gate";
import { describe, it } from "vitest";

describe("depsInstallGateExitCode", () => {
  it("maps a branch-or-HEAD checkout whose lockfile changed to the install exit code", () => {
    assertBranchLockfileChangeInstalls();
  });

  it("maps a file checkout to the skip exit code even when the lockfile changed", () => {
    assertFileCheckoutSkipsWhenLockfileChanged();
  });

  it("maps an unchanged lockfile to the skip exit code for any checkout kind", () => {
    assertUnchangedLockfileSkips();
  });
});

describe("resolveCheckoutFacts", () => {
  it("maps the git branch-checkout flag to the branch-checkout fact", () => {
    assertBranchFlagMapping();
  });

  it("maps a null or all-zero previous ref to a changed lockfile, regardless of the diff content", () => {
    assertNullRefMapsToChangedLockfile();
  });

  it("maps a null previous ref on a non-branch checkout to a changed lockfile with no branch checkout", () => {
    assertNullRefNonBranchCheckoutFacts();
  });

  it("maps a real previous ref to a changed lockfile exactly when the lockfile-scoped diff is non-empty", () => {
    assertRealRefMapsToLockfileDiffPresence();
  });
});
