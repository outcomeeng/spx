import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireClaim,
  claimFilePath,
  claimLockPath,
  claimLockTarget,
  OCCUPANCY_ERROR,
  OCCUPANCY_STATUS,
  type ProcessProbe,
  readClaim,
  readOccupancy,
  removeClaim,
  unreadableStartedAt,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import {
  createDeadHolderProbe,
  createForeignHostProbe,
  createLiveHolderProbe,
  createRecycledPidProbe,
} from "@testing/harnesses/worktree/harness";

function createThrowingProbe(): ProcessProbe {
  return {
    currentHost: () => {
      throw new Error(OCCUPANCY_ERROR.CLAIM_READ_FAILED);
    },
    isAlive: () => true,
    startTimeOf: () => undefined,
  };
}

describe("worktree occupancy claim store", () => {
  it("writes a claim file holding the four-field record for an unclaimed worktree", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      const written = await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, writeToken });
      expect(written.ok).toBe(true);

      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(record);
    });
  });

  it("removes the claim file when the running worktree releases", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, writeToken });
      const removed = await removeClaim(worktreesDir, name, record, createLiveHolderProbe(record), {
        fs: defaultOccupancyFileSystem,
      });
      expect(removed.ok).toBe(true);

      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
    });
  });

  it("refuses to replace a live-held claim and leaves the existing holder unchanged", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const existingRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, existingRecord, { fs: defaultOccupancyFileSystem, writeToken });

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createLiveHolderProbe(existingRecord),
        { fs: defaultOccupancyFileSystem, writeToken },
      );

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_HELD });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(existingRecord);
    });
  });

  it("keeps another holder's claim when an old holder releases after the claim has changed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const newRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [oldSessionId, newSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const oldRecord = { ...newRecord, sessionId: oldSessionId };
    const currentRecord = { ...newRecord, sessionId: newSessionId };
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, currentRecord, { fs: defaultOccupancyFileSystem, writeToken });

      const removed = await removeClaim(worktreesDir, name, oldRecord, createLiveHolderProbe(oldRecord), {
        fs: defaultOccupancyFileSystem,
      });

      expect(removed).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_RELEASE_NOT_OWNER });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(currentRecord);
    });
  });

  it("treats release of an absent claim in an absent worktrees directory as success", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());

    await withTempDir(prefix, async (root) => {
      const removed = await removeClaim(
        join(root, name),
        name,
        record,
        createLiveHolderProbe(record),
        { fs: defaultOccupancyFileSystem },
      );

      expect(removed.ok).toBe(true);
    });
  });

  it("replaces a residual claim whose holder is dead", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const existingRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, existingRecord, { fs: defaultOccupancyFileSystem, writeToken });

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(existingRecord),
        { fs: defaultOccupancyFileSystem, writeToken },
      );

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(nextRecord);
    });
  });

  it("recovers a claim-acquisition lock whose owner process is dead", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const deadLockOwner = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(claimLockTarget(deadLockOwner), claimLockPath(claimPath.value));

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(deadLockOwner),
        { fs: defaultOccupancyFileSystem, writeToken },
      );

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(nextRecord);
    });
  });

  it("recovers a claim-acquisition lock whose unreadable-start owner pid was recycled", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const lockOwnerBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const lockOwner = { ...lockOwnerBase, startedAt: unreadableStartedAt(lockOwnerBase.pid) };
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const recycledPidStartTime = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(claimLockTarget(lockOwner), claimLockPath(claimPath.value));

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createRecycledPidProbe(lockOwner, recycledPidStartTime),
        { fs: defaultOccupancyFileSystem, writeToken },
      );

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(nextRecord);
    });
  });

  it("keeps a claim-acquisition lock whose owner is on another host", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const [lockHost, claimantHost] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctHosts());
    const lockOwner = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), host: lockHost };
    const nextRecord = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), host: claimantHost };
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      const lockTarget = claimLockTarget(lockOwner);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(lockTarget, lockPath);

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createForeignHostProbe(lockOwner, claimantHost),
        { fs: defaultOccupancyFileSystem, writeToken },
      );

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      await expect(defaultOccupancyFileSystem.readlink(lockPath)).resolves.toBe(lockTarget);
    });
  });

  it("releases the claim-acquisition lock when the process probe throws during holder classification", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const existingRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, existingRecord, { fs: defaultOccupancyFileSystem, writeToken });

      const failed = await acquireClaim(worktreesDir, name, nextRecord, createThrowingProbe(), {
        fs: defaultOccupancyFileSystem,
        writeToken,
      });
      expect(failed.ok).toBe(false);

      const recovered = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(existingRecord),
        { fs: defaultOccupancyFileSystem, writeToken },
      );
      expect(recovered.ok).toBe(true);
    });
  });

  it("keeps an existing claim-acquisition lock when recovery classification throws", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const existingLockOwner = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      const lockTarget = claimLockTarget(existingLockOwner);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(lockTarget, lockPath);

      const failed = await acquireClaim(worktreesDir, name, nextRecord, createThrowingProbe(), {
        fs: defaultOccupancyFileSystem,
        writeToken,
      });
      expect(failed.ok).toBe(false);
      await expect(defaultOccupancyFileSystem.readlink(lockPath)).resolves.toBe(lockTarget);

      const recovered = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(existingLockOwner),
        { fs: defaultOccupancyFileSystem, writeToken },
      );
      expect(recovered.ok).toBe(true);
    });
  });

  it("reads a live-held claim as occupied and a released worktree as unclaimed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const probe = createLiveHolderProbe(record);
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, writeToken });
      const held = await readOccupancy(worktreesDir, name, probe, { fs: defaultOccupancyFileSystem });
      expect(held.ok).toBe(true);
      if (!held.ok) throw new Error(held.error);
      expect(held.value).toBe(OCCUPANCY_STATUS.RUNNING);

      await removeClaim(worktreesDir, name, record, probe, { fs: defaultOccupancyFileSystem });
      const freed = await readOccupancy(worktreesDir, name, probe, { fs: defaultOccupancyFileSystem });
      expect(freed.ok).toBe(true);
      if (!freed.ok) throw new Error(freed.error);
      expect(freed.value).toBe(OCCUPANCY_STATUS.FREE);
    });
  });
});
