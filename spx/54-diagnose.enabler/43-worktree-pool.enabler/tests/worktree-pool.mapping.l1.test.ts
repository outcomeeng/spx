import {
  assertWorktreePoolLayoutMapping,
  assertWorktreePoolOccupancyIsInformational,
} from "@testing/harnesses/diagnose/worktree-pool";
import { describe, it } from "vitest";

describe("the worktree-pool check classifies the layout from git worktree list and core.bare", () => {
  it("maps every supported layout to its verdict and bucket", assertWorktreePoolLayoutMapping);
  it("reports occupancy without degrading a compliant layout", assertWorktreePoolOccupancyIsInformational);
});
