import { describe, it } from "vitest";

import { assertWorktreeTouchingProbesAvoidStatus } from "@testing/harnesses/diagnose/worktree-snapshot-consumers";

describe("diagnose worktree-touching probes comply with the shared snapshot boundary", () => {
  it(
    "never executes worktree status while gathering worktree-touching readings",
    assertWorktreeTouchingProbesAvoidStatus,
  );
});
