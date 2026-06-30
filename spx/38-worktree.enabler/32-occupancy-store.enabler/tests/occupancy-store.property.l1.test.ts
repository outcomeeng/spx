import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  acquireClaim as acquireClaimBase,
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  type OccupancyFileSystem,
  type OccupancyFsOptions,
  type OccupancyWriteOptions,
  type ProcessProbe,
  readClaim,
  removeClaim as removeClaimBase,
  type WorktreeClaimRecord,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
import { defaultOccupancyFileSystem } from "@/lib/worktree-occupancy-file-system";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";
import {
  createLiveHolderProbe,
  createRecordingOccupancyFileSystem,
  OCCUPANCY_FS_OP,
} from "@testing/harnesses/worktree/harness";

type OccupancyReadFile = OccupancyFileSystem extends {
  readFile: infer ReadFile extends (...args: never[]) => Promise<string>;
} ? ReadFile
  : never;

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

class PausingClaimWriteFileSystem implements OccupancyFileSystem {
  private resumeWrite: (() => void) | undefined;
  private readonly tempWritten: Promise<void>;
  private markTempWritten: (() => void) | undefined;

  constructor(private readonly backing: OccupancyFileSystem) {
    this.tempWritten = new Promise((resolve) => {
      this.markTempWritten = resolve;
    });
  }

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    await this.backing.mkdir(path, options);
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.backing.writeFile(path, data);
    this.markTempWritten?.();
    await new Promise<void>((resolve) => {
      this.resumeWrite = resolve;
    });
  }

  async rename(from: string, to: string): Promise<void> {
    await this.backing.rename(from, to);
  }

  async readFile(...args: Parameters<OccupancyReadFile>): Promise<string> {
    return this.backing.readFile(...args);
  }

  async symlink(target: string, path: string): Promise<void> {
    await this.backing.symlink(target, path);
  }

  async readlink(path: string): Promise<string> {
    return this.backing.readlink(path);
  }

  async rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void> {
    await this.backing.rm(path, options);
  }

  async waitUntilTempWritten(): Promise<void> {
    await this.tempWritten;
  }

  continueWrite(): void {
    this.resumeWrite?.();
  }
}

class PausingClaimAcquisitionFileSystem implements OccupancyFileSystem {
  private resumeAcquisition: (() => void) | undefined;
  private readonly lockAcquired: Promise<void>;
  private markLockAcquired: (() => void) | undefined;

  constructor(private readonly backing: OccupancyFileSystem) {
    this.lockAcquired = new Promise((resolve) => {
      this.markLockAcquired = resolve;
    });
  }

  async mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void> {
    await this.backing.mkdir(path, options);
  }

  async symlink(target: string, path: string): Promise<void> {
    await this.backing.symlink(target, path);
    if (path.endsWith(OCCUPANCY_CLAIM.LOCK_EXTENSION)) {
      this.markLockAcquired?.();
      await new Promise<void>((resolve) => {
        this.resumeAcquisition = resolve;
      });
    }
  }

  async writeFile(path: string, data: string): Promise<void> {
    await this.backing.writeFile(path, data);
  }

  async rename(from: string, to: string): Promise<void> {
    await this.backing.rename(from, to);
  }

  async readFile(...args: Parameters<OccupancyReadFile>): Promise<string> {
    return this.backing.readFile(...args);
  }

  async readlink(path: string): Promise<string> {
    return this.backing.readlink(path);
  }

  async rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void> {
    await this.backing.rm(path, options);
  }

  async waitUntilLockAcquired(): Promise<void> {
    await this.lockAcquired;
  }

  continueAcquisition(): void {
    this.resumeAcquisition?.();
  }
}

describe("worktree occupancy claim store properties", () => {
  it("round-trips any claim record through write then read", async () => {
    const prefix = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.tempPrefix());

    await withTempDir(prefix, async (worktreesDir) => {
      await fc.assert(
        fc.asyncProperty(
          WORKTREE_TEST_GENERATOR.worktreeName(),
          WORKTREE_TEST_GENERATOR.claimRecord(),
          WORKTREE_TEST_GENERATOR.randomBytes(),
          async (name, record, randomBytes) => {
            const written = await writeClaim(worktreesDir, name, record, {
              fs: defaultOccupancyFileSystem,
              randomBytes,
            });
            expect(written.ok).toBe(true);

            const readBack = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(readBack.ok).toBe(true);
            if (!readBack.ok) throw new Error(readBack.error);
            expect(readBack.value).toEqual(record);
          },
        ),
        { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
      );
    });
  });

  it("writes the claim atomically — concurrent reads observe no claim until rename publishes the complete record", async () => {
    await fc.assert(
      fc.asyncProperty(
        WORKTREE_TEST_GENERATOR.tempPrefix(),
        WORKTREE_TEST_GENERATOR.worktreeName(),
        WORKTREE_TEST_GENERATOR.claimRecord(),
        WORKTREE_TEST_GENERATOR.randomBytes(),
        async (prefix, name, record, randomBytes) => {
          await withTempDir(prefix, async (worktreesDir) => {
            const pausing = new PausingClaimWriteFileSystem(defaultOccupancyFileSystem);
            const recording = createRecordingOccupancyFileSystem(pausing);
            const write = writeClaim(worktreesDir, name, record, { fs: recording, randomBytes });

            await pausing.waitUntilTempWritten();

            const concurrentRead = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(concurrentRead.ok).toBe(true);
            if (!concurrentRead.ok) throw new Error(concurrentRead.error);
            expect(concurrentRead.value).toBeUndefined();

            pausing.continueWrite();
            const written = await write;
            expect(written.ok).toBe(true);
            if (!written.ok) throw new Error(written.error);
            const claimPath = written.value;

            const writeCall = recording.calls.find((call) => call.op === OCCUPANCY_FS_OP.WRITE_FILE);
            const renameCall = recording.calls.find((call) => call.op === OCCUPANCY_FS_OP.RENAME);
            expect(writeCall).toBeDefined();
            expect(renameCall).toBeDefined();

            const writtenPath = writeCall?.paths[0];
            expect(writtenPath).not.toBe(claimPath);
            expect(writtenPath?.startsWith(`${claimPath}.`)).toBe(true);
            expect(renameCall?.paths[0]).toBe(writtenPath);
            expect(renameCall?.paths[1]).toBe(claimPath);
            expect(claimPath.endsWith(OCCUPANCY_CLAIM.FILE_EXTENSION)).toBe(true);

            const finalRead = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(finalRead.ok).toBe(true);
            if (!finalRead.ok) throw new Error(finalRead.error);
            expect(finalRead.value).toEqual(record);
          });
        },
      ),
      { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
    );
  });

  it("serializes claim acquisition so an overlapping claimant cannot overwrite the in-progress claim", async () => {
    await fc.assert(
      fc.asyncProperty(
        WORKTREE_TEST_GENERATOR.tempPrefix(),
        WORKTREE_TEST_GENERATOR.worktreeName(),
        WORKTREE_TEST_GENERATOR.claimRecord(),
        WORKTREE_TEST_GENERATOR.claimRecord(),
        WORKTREE_TEST_GENERATOR.distinctRandomBytes(),
        async (prefix, name, firstRecord, secondRecord, [firstWriteToken, secondWriteToken]) => {
          await withTempDir(prefix, async (worktreesDir) => {
            const pausing = new PausingClaimAcquisitionFileSystem(defaultOccupancyFileSystem);
            const first = acquireClaim(worktreesDir, name, firstRecord, createLiveHolderProbe(firstRecord), {
              fs: pausing,
              randomBytes: firstWriteToken,
            });

            await pausing.waitUntilLockAcquired();

            const second = await acquireClaim(worktreesDir, name, secondRecord, createLiveHolderProbe(firstRecord), {
              fs: defaultOccupancyFileSystem,
              randomBytes: secondWriteToken,
            });
            expect(second).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });

            pausing.continueAcquisition();
            const firstResult = await first;
            expect(firstResult.ok).toBe(true);

            const finalRead = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(finalRead.ok).toBe(true);
            if (!finalRead.ok) throw new Error(finalRead.error);
            expect(finalRead.value).toEqual(firstRecord);
          });
        },
      ),
      { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
    );
  });

  it("serializes claim release so an overlapping claimant cannot publish a successor before removal finishes", async () => {
    await fc.assert(
      fc.asyncProperty(
        WORKTREE_TEST_GENERATOR.tempPrefix(),
        WORKTREE_TEST_GENERATOR.worktreeName(),
        WORKTREE_TEST_GENERATOR.claimRecord(),
        WORKTREE_TEST_GENERATOR.claimRecord(),
        WORKTREE_TEST_GENERATOR.distinctRandomBytes(),
        async (prefix, name, firstRecord, secondRecord, [firstWriteToken, secondWriteToken]) => {
          await withTempDir(prefix, async (worktreesDir) => {
            await writeClaim(worktreesDir, name, firstRecord, {
              fs: defaultOccupancyFileSystem,
              randomBytes: firstWriteToken,
            });
            const pausing = new PausingClaimAcquisitionFileSystem(defaultOccupancyFileSystem);
            const release = removeClaim(worktreesDir, name, firstRecord, createLiveHolderProbe(firstRecord), {
              fs: pausing,
            });

            await pausing.waitUntilLockAcquired();

            const acquire = await acquireClaim(worktreesDir, name, secondRecord, createLiveHolderProbe(firstRecord), {
              fs: defaultOccupancyFileSystem,
              randomBytes: secondWriteToken,
            });
            expect(acquire).toEqual({ ok: false, error: OCCUPANCY_ERROR.CLAIM_LOCK_BUSY });

            pausing.continueAcquisition();
            const releaseResult = await release;
            expect(releaseResult.ok).toBe(true);

            const finalRead = await readClaim(worktreesDir, name, { fs: defaultOccupancyFileSystem });
            expect(finalRead.ok).toBe(true);
            if (!finalRead.ok) throw new Error(finalRead.error);
            expect(finalRead.value).toBeUndefined();
          });
        },
      ),
      { numRuns: WORKTREE_TEST_GENERATOR.counts.roundTripRunCount },
    );
  });
});
