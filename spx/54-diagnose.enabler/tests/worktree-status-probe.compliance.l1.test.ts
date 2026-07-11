import { describe, it } from "vitest";

import {
  assertMainCheckoutBranchProbeIgnoresGitEnvironment,
  assertWorktreeTouchingProbesAvoidStatus,
} from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("diagnose worktree-touching probes comply with the shared snapshot boundary", () => {
  it(
    "never executes worktree status while gathering worktree-touching readings",
    assertWorktreeTouchingProbesAvoidStatus,
  );
  it(
    "resolves the canonical checkout branch from its own working directory under inherited Git context",
    assertMainCheckoutBranchProbeIgnoresGitEnvironment,
  );
});
