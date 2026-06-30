import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireClaim,
  claimFilePath,
  claimLockPath,
  claimLockTarget,
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  OCCUPANCY_FS_TEXT_ENCODING,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
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
  createProcessProbe,
  createUnreadableStartTimeProbe,
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

class ReplacingStaleLockFileSystem implements OccupancyFileSystem {
  private replaced = false;

  constructor(
    private readonly backing: OccupancyFileSystem,
    private readonly lockPath: string,
    private readonly staleTarget: string,
    private readonly freshTarget: string,
  ) {}

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    await this.backing.mkdir(path, options);
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.backing.writeFile(path, data);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.backing.rename(from, to);
  }

  async symlink(target: string, path: string): Promise<void> {
    await this.backing.symlink(target, path);
  }

  async readlink(path: string): Promise<string> {
    const target = await this.backing.readlink(path);
    if (!this.replaced && path === this.lockPath && target === this.staleTarget) {
      this.replaced = true;
      await this.backing.rm(path, { force: true, recursive: true });
      await this.backing.symlink(this.freshTarget, path);
    }
    return target;
  }

  async readFile(path: string, encoding: typeof OCCUPANCY_FS_TEXT_ENCODING): Promise<string> {
    return this.backing.readFile(path, encoding);
  }

  async rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void> {
    await this.backing.rm(path, options);
  }
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

  it("keeps a claim-acquisition lock whose owner is alive with an unreadable start time", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const lockOwnerBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const lockOwner = { ...lockOwnerBase, startedAt: unreadableStartedAt(lockOwnerBase.pid) };
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
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
        createUnreadableStartTimeProbe(lockOwner),
        { fs: defaultOccupancyFileSystem, writeToken },
      );

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
      await expect(defaultOccupancyFileSystem.readlink(lockPath)).resolves.toBe(lockTarget);
    });
  });

  it("does not remove a fresh claim-acquisition lock after reading a stale lock owner", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [staleSessionId, freshSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const [staleStartedAt, freshStartedAt] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
    const [stalePid, freshPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const staleLockOwner = { ...claimBase, sessionId: staleSessionId, pid: stalePid, startedAt: staleStartedAt };
    const freshLockOwner = { ...claimBase, sessionId: freshSessionId, pid: freshPid, startedAt: freshStartedAt };
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([freshPid]),
      startTimes: new Map([[freshPid, freshStartedAt]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      const staleTarget = claimLockTarget(staleLockOwner);
      const freshTarget = claimLockTarget(freshLockOwner);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(staleTarget, lockPath);

      const acquired = await acquireClaim(worktreesDir, name, nextRecord, probe, {
        fs: new ReplacingStaleLockFileSystem(defaultOccupancyFileSystem, lockPath, staleTarget, freshTarget),
        writeToken,
      });

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      await expect(defaultOccupancyFileSystem.readlink(lockPath)).resolves.toBe(freshTarget);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
    });
  });

  it("recovers an orphaned claim-lock recovery marker whose owner process is dead", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [lockSessionId, recoverySessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const lockOwner = { ...claimBase, sessionId: lockSessionId };
    const recoveryOwner = { ...claimBase, sessionId: recoverySessionId };
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const writeToken = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.writeToken());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(claimLockTarget(lockOwner), lockPath);
      await defaultOccupancyFileSystem.symlink(
        claimLockTarget(recoveryOwner),
        `${lockPath}${OCCUPANCY_CLAIM.LOCK_RECOVERY_EXTENSION}`,
      );

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(lockOwner),
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
