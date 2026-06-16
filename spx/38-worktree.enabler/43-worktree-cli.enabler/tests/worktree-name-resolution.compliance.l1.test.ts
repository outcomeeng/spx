import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { statusCommand } from "@/commands/worktree/index";
import { OCCUPANCY_STATUS } from "@/domains/worktree/occupancy-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withWorktreePool } from "@testing/harnesses/worktree/harness";

describe("worktree status non-worktree path compliance", () => {
  it("NEVER reports a path outside every worktree as an unclaimed worktree", async () => {
    const [worktreeName, absentName] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
    const holder = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolHolder());

    await withWorktreePool({ worktreeName, holder }, async (env) => {
      // A sibling path under the pool container that was never provisioned as a
      // worktree — the `spx worktree status ~/…/spx-non-existent` case.
      const nonWorktreePath = join(env.container, absentName);

      const status = await statusCommand({
        worktree: nonWorktreePath,
        worktreesDir: env.worktreesDir,
        processTable: env.processTable,
      });

      // A path that resolves to no worktree must be refused, never rendered as a
      // free (unclaimed) worktree.
      expect(status.ok).toBe(false);
      if (status.ok) {
        throw new Error(`expected refusal, got status "${status.value}"`);
      }
      expect(status.error).not.toContain(OCCUPANCY_STATUS.UNCLAIMED);
    });
  });
});
