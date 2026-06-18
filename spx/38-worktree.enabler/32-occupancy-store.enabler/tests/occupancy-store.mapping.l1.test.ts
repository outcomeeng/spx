import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  claimFilePath,
  claimTempFilePath,
  classifyOccupancy,
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  OCCUPANCY_STATUS,
  type OccupancyFileSystem,
  unreadableStartedAt,
  type WorktreeClaimRecord,
  writeClaim,
} from "@/domains/worktree/occupancy-store";
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

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(OCCUPANCY_ERROR.CLAIM_READ_FAILED);
    return content;
  }

  async rm(path: string): Promise<void> {
    this.files.delete(path);
  }
}

function identicalClaimRecordWithDistinctWriteTokens(): readonly [WorktreeClaimRecord, readonly [string, string]] {
  return sampleWorktreeTestValue(
    WORKTREE_TEST_GENERATOR.claimRecord().chain((record) =>
      WORKTREE_TEST_GENERATOR.distinctWriteTokens().map((tokens) => [record, tokens] as const),
    ),
  );
}

describe("worktree occupancy classification mapping", () => {
  it("maps no claim to unclaimed", () => {
    const probe = createLiveHolderProbe(sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()));
    expect(classifyOccupancy(undefined, probe)).toBe(OCCUPANCY_STATUS.UNCLAIMED);
  });

  it("maps a same-host holder that is alive with a matching start time to occupied", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    expect(classifyOccupancy(record, createLiveHolderProbe(record))).toBe(OCCUPANCY_STATUS.OCCUPIED);
  });

  it("maps a claim whose holder process is dead to stale", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    expect(classifyOccupancy(record, createDeadHolderProbe(record))).toBe(OCCUPANCY_STATUS.STALE);
  });

  it("maps a claim recorded on a different host to stale", () => {
    const [recordHost, foreignHost] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctHosts());
    const record = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), host: recordHost };
    expect(classifyOccupancy(record, createForeignHostProbe(record, foreignHost))).toBe(OCCUPANCY_STATUS.STALE);
  });

  it("maps a claim whose pid was recycled to a different live process to stale", () => {
    const [claimStart, liveStart] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctStartTimes());
    const record = { ...sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord()), startedAt: claimStart };
    expect(classifyOccupancy(record, createRecycledPidProbe(record, liveStart))).toBe(OCCUPANCY_STATUS.STALE);
  });

  it("maps a live same-host holder whose start time cannot be read to occupied", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    expect(classifyOccupancy(record, createUnreadableStartTimeProbe(record))).toBe(OCCUPANCY_STATUS.OCCUPIED);
  });

  it("maps a live same-host holder claimed with an unreadable-start token to occupied", () => {
    const record = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.claimRecord());
    const unreadableRecord = { ...record, startedAt: unreadableStartedAt(record.pid) };
    expect(classifyOccupancy(unreadableRecord, createLiveHolderProbe(record))).toBe(OCCUPANCY_STATUS.OCCUPIED);
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
    const [record, [firstWriteToken, secondWriteToken]] = identicalClaimRecordWithDistinctWriteTokens();
    const fs = new RecordingClaimFileSystem();
    const claimPath = claimFilePath(worktreesDir, name);
    expect(claimPath.ok).toBe(true);
    if (!claimPath.ok) throw new Error(claimPath.error);

    const [first, second] = await Promise.all([
      writeClaim(worktreesDir, name, record, { fs, writeToken: firstWriteToken }),
      writeClaim(worktreesDir, name, record, { fs, writeToken: secondWriteToken }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(new Set(fs.renamedFrom)).toEqual(
      new Set([
        claimTempFilePath(claimPath.value, firstWriteToken),
        claimTempFilePath(claimPath.value, secondWriteToken),
      ].map((path) => {
        expect(path.ok).toBe(true);
        if (!path.ok) throw new Error(path.error);
        return path.value;
      })),
    );
  });
});
