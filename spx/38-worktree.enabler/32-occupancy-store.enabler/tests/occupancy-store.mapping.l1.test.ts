import { describe, expect, it } from "vitest";

import {
  claimFilePath,
  classifyOccupancy,
  OCCUPANCY_CLAIM,
  OCCUPANCY_ERROR,
  OCCUPANCY_STATUS,
} from "@/domains/worktree/occupancy-store";
import { sampleStateStoreTestValue, STATE_STORE_TEST_GENERATOR } from "@testing/generators/state-store/state-store";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";
import {
  createDeadHolderProbe,
  createForeignHostProbe,
  createLiveHolderProbe,
  createRecycledPidProbe,
} from "@testing/harnesses/worktree/harness";

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

  it("maps a safe name to a claim path and an empty or unsafe name to the INVALID_NAME rejection", () => {
    const worktreesDir = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.productRoot());
    const safeName = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.worktreeName());
    const unsafeName = sampleStateStoreTestValue(STATE_STORE_TEST_GENERATOR.scopeTokenContainingUnsafeMarker());

    const safe = claimFilePath(worktreesDir, safeName);
    expect(safe.ok).toBe(true);
    if (!safe.ok) throw new Error(safe.error);
    expect(safe.value.endsWith(`${safeName}${OCCUPANCY_CLAIM.FILE_EXTENSION}`)).toBe(true);

    const empty = claimFilePath(worktreesDir, "");
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error("expected the empty name to be rejected");
    expect(empty.error).toBe(OCCUPANCY_ERROR.INVALID_NAME);

    const unsafe = claimFilePath(worktreesDir, unsafeName);
    expect(unsafe.ok).toBe(false);
    if (unsafe.ok) throw new Error("expected the unsafe name to be rejected");
    expect(unsafe.error).toBe(OCCUPANCY_ERROR.INVALID_NAME);
  });
});
