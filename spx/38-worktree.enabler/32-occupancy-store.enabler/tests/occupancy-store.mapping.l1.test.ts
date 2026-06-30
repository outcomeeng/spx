import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  claimFilePath,
  classifyOccupancy,
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
  unreadableStartedAt,
  type WorktreeClaimRecord,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
import { atomicWriteTempPath, type RandomBytes } from "@/lib/atomic-file-write";
import { toMessage } from "@/lib/error-message";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  createDeadHolderProbe,
  createForeignHostProbe,
  createLiveHolderProbe,
  createRecycledPidProbe,
  createUnreadableStartTimeProbe,
} from "@testing/harnesses/worktree/harness";

class RecordingClaimFileSystem implements OccupancyFileSystem {
  readonly directories = new Set<string>();
  readonly files = new Map<string, string>();
  readonly renamedFrom: string[] = [];

  async mkdir(path: string): Promise<void> {
    this.directories.add(path);
  }

  async writeFile(path: string, data: string): Promise<void> {
    this.files.set(path, data);
  }

  async rename(from: string, to: string): Promise<void> {
    const content = this.files.get(from);
    if (content === undefined) throw new Error(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED);
    this.renamedFrom.push(from);
    this.files.delete(from);
    this.files.set(to, content);
  }

  async symlink(target: string, path: string): Promise<void> {
    this.files.set(path, target);
  }

  async readlink(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(OCCUPANCY_ERROR.CLAIM_READ_FAILED);
    return content;
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(OCCUPANCY_ERROR.CLAIM_READ_FAILED);
    return content;
  }

  async rm(path: string): Promise<void> {
    this.files.delete(path);
  }
}

class SymbolThrowingClaimFileSystem implements OccupancyFileSystem {
  mkdir(): Promise<void> {
    return Promise.resolve();
  }

  async writeFile(): Promise<void> {
    throw Symbol();
  }

  rename(): Promise<void> {
    return Promise.resolve();
  }

  symlink(): Promise<void> {
    return Promise.resolve();
  }

  readlink(): Promise<string> {
    return Promise.resolve("");
  }

  async readFile(): Promise<string> {
    return "";
  }

  rm(): Promise<void> {
    return Promise.resolve();
  }
}

function identicalClaimRecordWithDistinctRandomBytes(): readonly [
  WorktreeClaimRecord,
  readonly [RandomBytes, RandomBytes],
] {
  return sampleWorktreeTestValue(
    WORKTREE_TEST_GENERATOR.claimRecord().chain((record) =>
      WORKTREE_TEST_GENERATOR.distinctRandomBytes().map((randomBytesPair) => [record, randomBytesPair] as const)
    ),
  );
}

describe("worktree occupancy classification mapping", () => {
  it("maps no claim to free", () => {
    const probe = createLiveHolderProbe(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()));
    expect(classifyOccupancy(undefined, probe)).toBe(OCCUPANCY_STATUS.FREE);
  });

  it("maps a same-host holder that is alive with a matching start time to running", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    expect(classifyOccupancy(record, createLiveHolderProbe(record))).toBe(OCCUPANCY_STATUS.RUNNING);
  });

  it("maps a claim whose holder process is dead to free", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    expect(classifyOccupancy(record, createDeadHolderProbe(record))).toBe(OCCUPANCY_STATUS.FREE);
  });

  it("maps a claim recorded on a different host to free", () => {
    const [recordHost, foreignHost] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctHosts());
    const record = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), host: recordHost };
    expect(classifyOccupancy(record, createForeignHostProbe(record, foreignHost))).toBe(OCCUPANCY_STATUS.FREE);
  });

  it("maps a claim whose pid was recycled to a different live process to free", () => {
    const [claimStart, liveStart] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
    const record = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), startedAt: claimStart };
    expect(classifyOccupancy(record, createRecycledPidProbe(record, liveStart))).toBe(OCCUPANCY_STATUS.FREE);
  });

  it("maps a live same-host holder whose start time cannot be read to running", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    expect(classifyOccupancy(record, createUnreadableStartTimeProbe(record))).toBe(OCCUPANCY_STATUS.RUNNING);
  });

  it("maps a live same-host holder claimed with an unreadable-start token to running", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const unreadableRecord = { ...record, startedAt: unreadableStartedAt(record.pid) };
    expect(classifyOccupancy(unreadableRecord, createLiveHolderProbe(record))).toBe(OCCUPANCY_STATUS.RUNNING);
  });

  it("maps a safe name to a claim path and an empty or unsafe name to the INVALID_NAME rejection", () => {
    const worktreesDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const safeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const unsafeName = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker());

    const safe = claimFilePath(worktreesDir, safeName);
    expect(safe.ok).toBe(true);
    if (!safe.ok) throw new Error(safe.error);
    expect(safe.value).toBe(join(worktreesDir, `${safeName}${OCCUPANCY_CLAIM.FILE_EXTENSION}`));

    const empty = claimFilePath(worktreesDir, "");
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error("expected the empty name to be rejected");
    expect(empty.error).toBe(OCCUPANCY_ERROR.INVALID_NAME);

    const unsafe = claimFilePath(worktreesDir, unsafeName);
    expect(unsafe.ok).toBe(false);
    if (unsafe.ok) throw new Error("expected the unsafe name to be rejected");
    expect(unsafe.error).toBe(OCCUPANCY_ERROR.INVALID_NAME);
  });

  it("maps overlapping writes for one worktree to writer-unique temporary claim paths", async () => {
    const worktreesDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const [record, [firstRandomBytes, secondRandomBytes]] = identicalClaimRecordWithDistinctRandomBytes();
    const fs = new RecordingClaimFileSystem();
    const claimPath = claimFilePath(worktreesDir, name);
    expect(claimPath.ok).toBe(true);
    if (!claimPath.ok) throw new Error(claimPath.error);
    const firstTempPath = atomicWriteTempPath(claimPath.value, firstRandomBytes);
    const secondTempPath = atomicWriteTempPath(claimPath.value, secondRandomBytes);

    const [first, second] = await Promise.all([
      writeClaim(worktreesDir, name, record, { fs, randomBytes: firstRandomBytes }),
      writeClaim(worktreesDir, name, record, { fs, randomBytes: secondRandomBytes }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(new Set(fs.renamedFrom)).toEqual(
      new Set([firstTempPath, secondTempPath]),
    );
  });

  it("maps an unserializable thrown write failure to a formatted occupancy error", async () => {
    const worktreesDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const name = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const randomBytes = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.randomBytes());

    const result = await writeClaim(worktreesDir, name, record, {
      fs: new SymbolThrowingClaimFileSystem(),
      randomBytes,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected write failure");
    expect(result.error).toContain(OCCUPANCY_ERROR.CLAIM_WRITE_FAILED);
    expect(result.error).toContain(toMessage(Symbol()));
  });
});
