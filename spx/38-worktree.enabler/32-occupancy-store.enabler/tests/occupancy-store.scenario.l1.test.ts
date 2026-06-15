import { describe, expect, it } from "vitest";

import {
  OCCUPANCY_STATUS,
  readClaim,
  readOccupancy,
  removeClaim,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import { createLiveHolderProbe } from "@testing/harnesses/worktree/harness";

describe("worktree occupancy claim store", () => {
  it("writes a claim file holding the four-field record for an unclaimed worktree", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());

    await withTempDir(prefix, async (worktreesDir) => {
      const written = await writeClaim(worktreesDir, name, record);
      expect(written.ok).toBe(true);

      const readBack = await readClaim(worktreesDir, name);
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(record);
    });
  });

  it("removes the claim file when the running worktree releases", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record);
      const removed = await removeClaim(worktreesDir, name);
      expect(removed.ok).toBe(true);

      const readBack = await readClaim(worktreesDir, name);
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
    });
  });

  it("reads a live-held claim as occupied and a released worktree as unclaimed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const probe = createLiveHolderProbe(record);

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record);
      const held = await readOccupancy(worktreesDir, name, probe);
      expect(held.ok).toBe(true);
      if (!held.ok) throw new Error(held.error);
      expect(held.value).toBe(OCCUPANCY_STATUS.OCCUPIED);

      await removeClaim(worktreesDir, name);
      const freed = await readOccupancy(worktreesDir, name, probe);
      expect(freed.ok).toBe(true);
      if (!freed.ok) throw new Error(freed.error);
      expect(freed.value).toBe(OCCUPANCY_STATUS.UNCLAIMED);
    });
  });
});
