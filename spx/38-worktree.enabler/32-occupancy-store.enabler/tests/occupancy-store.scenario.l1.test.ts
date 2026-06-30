import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  acquireClaim as acquireClaimBase,
  claimFilePath,
  claimLockPath,
  claimLockTarget,
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  OCCUPANCY_FS_TEXT_ENCODING,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
  type OccupancyFsOptions,
  type OccupancyWriteOptions,
  type ProcessProbe,
  readClaim,
  readOccupancy,
  removeClaim as removeClaimBase,
  unreadableStartedAt,
  type WorktreeClaimRecord,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
import { ERROR_CODE_NOT_FOUND, hasErrorCode } from "@/lib/state-store";
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

async function expectLinkAbsent(path: string): Promise<void> {
  let target: string;
  try {
    target = await defaultOccupancyFileSystem.readlink(path);
  } catch (error) {
    expect(hasErrorCode(error, ERROR_CODE_NOT_FOUND)).toBe(true);
    return;
  }
  throw new Error(`${OCCUPANCY_ERROR.CLAIM_UNLOCK_FAILED}: ${target}`);
}

async function expectLinkRecord(path: string, record: WorktreeClaimRecord): Promise<void> {
  const target = await defaultOccupancyFileSystem.readlink(path);
  const parsed: unknown = JSON.parse(target);
  expect(parsed).toEqual(record);
}

function acquireClaim(
  worktreesDir: string,
  name: string,
  record: WorktreeClaimRecord,
  probe: ProcessProbe,
  options: OccupancyWriteOptions,
): ReturnType<typeof acquireClaimBase> {
  return acquireClaimBase(worktreesDir, name, record, probe, { ...options, operation: record });
}

function removeClaim(
  worktreesDir: string,
  name: string,
  owner: WorktreeClaimRecord,
  probe: ProcessProbe,
  options: OccupancyFsOptions,
): ReturnType<typeof removeClaimBase> {
  return removeClaimBase(worktreesDir, name, owner, probe, { ...options, operation: owner });
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

class FailingLockRemovalFileSystem implements OccupancyFileSystem {
  private failed = false;

  constructor(
    private readonly backing: OccupancyFileSystem,
    private readonly lockPath: string,
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
    return this.backing.readlink(path);
  }

  async readFile(path: string, encoding: typeof OCCUPANCY_FS_TEXT_ENCODING): Promise<string> {
    return this.backing.readFile(path, encoding);
  }

  async rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void> {
    if (!this.failed && path === this.lockPath) {
      this.failed = true;
      throw new Error(OCCUPANCY_ERROR.CLAIM_UNLOCK_FAILED);
    }
    await this.backing.rm(path, options);
  }
}

describe("worktree occupancy claim store", () => {
  it("writes a claim file holding the four-field record for an unclaimed worktree", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      const written = await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
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
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
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

  it("removes a claim written with an unreadable start time after the live holder start time becomes readable", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const readableStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const storedRecord = { ...claimBase, startedAt: unreadableStartedAt(claimBase.pid) };
    const releaseRecord = { ...claimBase, startedAt: readableStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([claimBase.pid]),
      startTimes: new Map([[claimBase.pid, readableStartedAt]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, storedRecord, { fs: defaultOccupancyFileSystem, randomBytes });

      const removed = await removeClaim(worktreesDir, name, releaseRecord, probe, {
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
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [existingSessionId, nextSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const existingRecord = { ...claimBase, sessionId: existingSessionId };
    const nextRecord = { ...claimBase, sessionId: nextSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, existingRecord, { fs: defaultOccupancyFileSystem, randomBytes });

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createLiveHolderProbe(existingRecord),
        { fs: defaultOccupancyFileSystem, randomBytes },
      );

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_HELD });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(existingRecord);
    });
  });

  it("treats a repeated acquisition by the same live holder as successful and keeps the claim unchanged", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        record,
        createLiveHolderProbe(record),
        { fs: defaultOccupancyFileSystem, randomBytes },
      );

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(record);
    });
  });

  it("treats a repeated acquisition as the same holder after an unreadable start time becomes readable", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const readableStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const storedRecord = { ...claimBase, startedAt: unreadableStartedAt(claimBase.pid) };
    const retryRecord = { ...claimBase, startedAt: readableStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([claimBase.pid]),
      startTimes: new Map([[claimBase.pid, readableStartedAt]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, storedRecord, { fs: defaultOccupancyFileSystem, randomBytes });

      const acquired = await acquireClaim(worktreesDir, name, retryRecord, probe, {
        fs: defaultOccupancyFileSystem,
        randomBytes,
      });

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(storedRecord);
    });
  });

  it("keeps another holder's claim when an old holder releases after the claim has changed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const newRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [oldSessionId, newSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const oldRecord = { ...newRecord, sessionId: oldSessionId };
    const currentRecord = { ...newRecord, sessionId: newSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, currentRecord, { fs: defaultOccupancyFileSystem, randomBytes });

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

  it("does not remove a fresh claim-acquisition lock while releasing an old owner", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [oldSessionId, freshSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const oldRecord = { ...claimBase, sessionId: oldSessionId };
    const freshRecord = { ...claimBase, sessionId: freshSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, oldRecord, { fs: defaultOccupancyFileSystem, randomBytes });
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      const oldTarget = claimLockTarget(oldRecord);
      const freshTarget = claimLockTarget(freshRecord);

      const removed = await removeClaim(worktreesDir, name, oldRecord, createLiveHolderProbe(oldRecord), {
        fs: new ReplacingStaleLockFileSystem(defaultOccupancyFileSystem, lockPath, oldTarget, freshTarget),
      });

      expect(removed.ok).toBe(true);
      await expectLinkRecord(lockPath, freshRecord);
    });
  });

  it("keeps a live operation residual lock after the claim is removed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [holderPid, operationPid, nextOperationPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const holderStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const operationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const nextOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const record = { ...claimBase, pid: holderPid, startedAt: holderStartedAt };
    const operation = { ...claimBase, pid: operationPid, startedAt: operationStartedAt };
    const nextOperation = { ...claimBase, pid: nextOperationPid, startedAt: nextOperationStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([operationPid, nextOperationPid]),
      startTimes: new Map([
        [operationPid, operationStartedAt],
        [nextOperationPid, nextOperationStartedAt],
      ]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);

      const failedRelease = await removeClaimBase(worktreesDir, name, record, probe, {
        fs: new FailingLockRemovalFileSystem(defaultOccupancyFileSystem, lockPath),
        operation,
      });

      expect(failedRelease.ok).toBe(false);
      await expectLinkRecord(lockPath, operation);
      const removedClaim = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(removedClaim.ok).toBe(true);
      if (!removedClaim.ok) throw new Error(removedClaim.error);
      expect(removedClaim.value).toBeUndefined();

      const acquired = await acquireClaimBase(worktreesDir, name, record, probe, {
        fs: defaultOccupancyFileSystem,
        operation: nextOperation,
        randomBytes,
      });

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
      await expectLinkRecord(lockPath, operation);
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
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [existingSessionId, nextSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const existingRecord = { ...claimBase, sessionId: existingSessionId };
    const nextRecord = { ...claimBase, sessionId: nextSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, existingRecord, { fs: defaultOccupancyFileSystem, randomBytes });

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(existingRecord),
        { fs: defaultOccupancyFileSystem, randomBytes },
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
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(claimLockTarget(deadLockOwner), lockPath);

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(deadLockOwner),
        { fs: defaultOccupancyFileSystem, randomBytes },
      );

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(nextRecord);
      await expectLinkAbsent(lockPath);
    });
  });

  it("keeps a claim-acquisition lock whose owner is alive with an unreadable start time", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const lockOwnerBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const lockOwner = { ...lockOwnerBase, startedAt: unreadableStartedAt(lockOwnerBase.pid) };
    const nextRecord = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

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
        { fs: defaultOccupancyFileSystem, randomBytes },
      );

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
      await expectLinkRecord(lockPath, lockOwner);
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
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
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
        randomBytes,
      });

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      await expectLinkRecord(lockPath, freshLockOwner);
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
    const [lockPid, recoveryPid, nextPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const lockOwner = { ...claimBase, sessionId: lockSessionId, pid: lockPid };
    const recoveryOwner = { ...claimBase, sessionId: recoverySessionId, pid: recoveryPid };
    const nextRecord = { ...claimBase, pid: nextPid };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      const recoveryPath = `${lockPath}${OCCUPANCY_CLAIM.LOCK_RECOVERY_EXTENSION}`;
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(claimLockTarget(lockOwner), lockPath);
      await defaultOccupancyFileSystem.symlink(claimLockTarget(recoveryOwner), recoveryPath);

      const acquired = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(lockOwner),
        { fs: defaultOccupancyFileSystem, randomBytes },
      );

      expect(acquired.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(nextRecord);
      await expectLinkAbsent(recoveryPath);
    });
  });

  it("keeps a claim-lock recovery marker whose owner is the live acquisition requester", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [lockSessionId, recoverySessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const [lockPid, recoveryPid] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPids());
    const [lockStartedAt, recoveryStartedAt] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
    const lockOwner = { ...claimBase, sessionId: lockSessionId, pid: lockPid, startedAt: lockStartedAt };
    const nextRecord = { ...claimBase, sessionId: recoverySessionId, pid: recoveryPid, startedAt: recoveryStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([recoveryPid]),
      startTimes: new Map([[recoveryPid, recoveryStartedAt]]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      const recoveryPath = `${lockPath}${OCCUPANCY_CLAIM.LOCK_RECOVERY_EXTENSION}`;
      await defaultOccupancyFileSystem.mkdir(worktreesDir, { recursive: true });
      await defaultOccupancyFileSystem.symlink(claimLockTarget(lockOwner), lockPath);
      await defaultOccupancyFileSystem.symlink(claimLockTarget(nextRecord), recoveryPath);

      const acquired = await acquireClaim(worktreesDir, name, nextRecord, probe, {
        fs: defaultOccupancyFileSystem,
        randomBytes,
      });

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
      await expectLinkRecord(lockPath, lockOwner);
      await expectLinkRecord(recoveryPath, nextRecord);
    });
  });

  it("keeps a live operation claim-acquisition lock while the claim exists", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [holderPid, lockOperationPid, nextOperationPid] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPids(),
    );
    const holderStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const lockOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const nextOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const record = { ...claimBase, pid: holderPid, startedAt: holderStartedAt };
    const lockOperation = { ...claimBase, pid: lockOperationPid, startedAt: lockOperationStartedAt };
    const nextOperation = { ...claimBase, pid: nextOperationPid, startedAt: nextOperationStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([lockOperationPid, nextOperationPid]),
      startTimes: new Map([
        [lockOperationPid, lockOperationStartedAt],
        [nextOperationPid, nextOperationStartedAt],
      ]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      await defaultOccupancyFileSystem.symlink(claimLockTarget(lockOperation), lockPath);

      const acquired = await acquireClaimBase(worktreesDir, name, record, probe, {
        fs: defaultOccupancyFileSystem,
        operation: nextOperation,
        randomBytes,
      });

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(record);
      await expectLinkRecord(lockPath, lockOperation);
    });
  });

  it("keeps a live operation claim-acquisition lock while releasing the claim", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [holderPid, lockOperationPid, releaseOperationPid] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPids(),
    );
    const holderStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const lockOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const releaseOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const record = { ...claimBase, pid: holderPid, startedAt: holderStartedAt };
    const lockOperation = { ...claimBase, pid: lockOperationPid, startedAt: lockOperationStartedAt };
    const releaseOperation = { ...claimBase, pid: releaseOperationPid, startedAt: releaseOperationStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([lockOperationPid, releaseOperationPid]),
      startTimes: new Map([
        [lockOperationPid, lockOperationStartedAt],
        [releaseOperationPid, releaseOperationStartedAt],
      ]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      await defaultOccupancyFileSystem.symlink(claimLockTarget(lockOperation), lockPath);

      const removed = await removeClaimBase(worktreesDir, name, record, probe, {
        fs: defaultOccupancyFileSystem,
        operation: releaseOperation,
      });

      expect(removed).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toEqual(record);
      await expectLinkRecord(lockPath, lockOperation);
    });
  });

  it("recovers a dead operation claim-acquisition lock while releasing the claim", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [holderPid, deadOperationPid, releaseOperationPid] = sampleWorktreeTestValue(
      WORKTREE_TEST_GENERATOR.distinctPids(),
    );
    const holderStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const deadOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const releaseOperationStartedAt = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.startTime());
    const record = { ...claimBase, pid: holderPid, startedAt: holderStartedAt };
    const deadOperation = { ...claimBase, pid: deadOperationPid, startedAt: deadOperationStartedAt };
    const releaseOperation = { ...claimBase, pid: releaseOperationPid, startedAt: releaseOperationStartedAt };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());
    const probe = createProcessProbe({
      host: claimBase.host,
      alivePids: new Set([holderPid, releaseOperationPid]),
      startTimes: new Map([
        [holderPid, holderStartedAt],
        [releaseOperationPid, releaseOperationStartedAt],
      ]),
    });

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
      const claimPath = claimFilePath(worktreesDir, name);
      expect(claimPath.ok).toBe(true);
      if (!claimPath.ok) throw new Error(claimPath.error);
      const lockPath = claimLockPath(claimPath.value);
      await defaultOccupancyFileSystem.symlink(claimLockTarget(deadOperation), lockPath);

      const removed = await removeClaimBase(worktreesDir, name, record, probe, {
        fs: defaultOccupancyFileSystem,
        operation: releaseOperation,
      });

      expect(removed.ok).toBe(true);
      const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
      expect(readBack.ok).toBe(true);
      if (!readBack.ok) throw new Error(readBack.error);
      expect(readBack.value).toBeUndefined();
      await expectLinkAbsent(lockPath);
    });
  });

  it("keeps a claim-acquisition lock whose owner is on another host", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const [lockHost, claimantHost] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctHosts());
    const lockOwner = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), host: lockHost };
    const nextRecord = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), host: claimantHost };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

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
        { fs: defaultOccupancyFileSystem, randomBytes },
      );

      expect(acquired).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });
      await expectLinkRecord(lockPath, lockOwner);
    });
  });

  it("releases the claim-acquisition lock when the process probe throws during holder classification", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [existingSessionId, nextSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const existingRecord = { ...claimBase, sessionId: existingSessionId };
    const nextRecord = { ...claimBase, sessionId: nextSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, existingRecord, { fs: defaultOccupancyFileSystem, randomBytes });

      const failed = await acquireClaim(worktreesDir, name, nextRecord, createThrowingProbe(), {
        fs: defaultOccupancyFileSystem,
        randomBytes,
      });
      expect(failed.ok).toBe(false);

      const recovered = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(existingRecord),
        { fs: defaultOccupancyFileSystem, randomBytes },
      );
      expect(recovered.ok).toBe(true);
    });
  });

  it("keeps an existing claim-acquisition lock when recovery classification throws", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const claimBase = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const [existingSessionId, nextSessionId] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctSessionIds());
    const existingLockOwner = { ...claimBase, sessionId: existingSessionId };
    const nextRecord = { ...claimBase, sessionId: nextSessionId };
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

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
        randomBytes,
      });
      expect(failed.ok).toBe(false);
      await expectLinkRecord(lockPath, existingLockOwner);

      const recovered = await acquireClaim(
        worktreesDir,
        name,
        nextRecord,
        createDeadHolderProbe(existingLockOwner),
        { fs: defaultOccupancyFileSystem, randomBytes },
      );
      expect(recovered.ok).toBe(true);
    });
  });

  it("reads a live-held claim as occupied and a released worktree as unclaimed", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const probe = createLiveHolderProbe(record);
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    await withTempDir(prefix, async (worktreesDir) => {
      await writeClaim(worktreesDir, name, record, { fs: defaultOccupancyFileSystem, randomBytes });
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
