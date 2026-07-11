import { describe, it } from "vitest";

import { assertFreeWorktreesPreserveLayout } from "@testing/harnesses/diagnose/worktree-pool";

describe("the worktree-pool snapshot preserves layout verdicts when free worktrees are added", () => {
  it(
    "keeps a compliant layout healthy when adding a never-claimed or dead-claimed worktree",
    assertFreeWorktreesPreserveLayout,
  );
});
