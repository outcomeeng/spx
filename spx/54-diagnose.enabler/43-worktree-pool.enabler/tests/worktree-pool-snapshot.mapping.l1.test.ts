import { describe, it } from "vitest";

import { assertWorktreePoolSnapshotMapping } from "@testing/harnesses/diagnose/worktree-pool";

describe("the worktree-pool snapshot maps git facts and occupancy into the worktree-pool reading", () => {
  it("maps topology, canonical standing, and occupancy into one classified reading", assertWorktreePoolSnapshotMapping);
});
