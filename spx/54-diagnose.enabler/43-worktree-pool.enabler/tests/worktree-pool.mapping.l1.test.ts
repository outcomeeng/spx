import { describe, expect, it } from "vitest";

import {
  classifyWorktreePool,
  WORKTREE_POOL_VERDICT,
  type WorktreePoolReading,
} from "@/domains/diagnose/checks/worktree-pool";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

const reading = (overrides: Partial<WorktreePoolReading>): WorktreePoolReading => ({
  errored: false,
  bareRepository: false,
  linkedWorktrees: false,
  mainCheckoutPath: null,
  defaultBranch: null,
  mainCheckoutBranch: null,
  mainCheckoutBranchRead: true,
  running: 0,
  free: 0,
  ...overrides,
});

describe("the worktree-pool check classifies the layout from git worktree list and core.bare", () => {
  it.each([
    { overrides: { errored: true }, verdict: WORKTREE_POOL_VERDICT.UNKNOWN, bucket: VERDICT_BUCKET.UNKNOWN },
    {
      overrides: { bareRepository: false, linkedWorktrees: true },
      verdict: WORKTREE_POOL_VERDICT.NON_COMPLIANT,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: {
        bareRepository: true,
        mainCheckoutPath: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        defaultBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        mainCheckoutBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      },
      verdict: WORKTREE_POOL_VERDICT.COMPLIANT,
      bucket: VERDICT_BUCKET.HEALTHY,
    },
    {
      overrides: { bareRepository: true },
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: {
        bareRepository: true,
        mainCheckoutPath: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        defaultBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      },
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: {
        bareRepository: true,
        mainCheckoutPath: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        defaultBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames())[0],
        mainCheckoutBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames())[1],
      },
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: {
        bareRepository: true,
        mainCheckoutPath: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        mainCheckoutBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      },
      verdict: WORKTREE_POOL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    {
      overrides: {
        bareRepository: true,
        mainCheckoutPath: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        defaultBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
        mainCheckoutBranchRead: false,
      },
      verdict: WORKTREE_POOL_VERDICT.UNKNOWN,
      bucket: VERDICT_BUCKET.UNKNOWN,
    },
    { overrides: {}, verdict: WORKTREE_POOL_VERDICT.COMPLIANT, bucket: VERDICT_BUCKET.HEALTHY },
  ])("classifies the worktree layout as $verdict (bucket $bucket)", ({ overrides, verdict, bucket }) => {
    const result = classifyWorktreePool(reading(overrides));
    expect(result.verdict).toBe(verdict);
    expect(result.bucket).toBe(bucket);
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("ranks a non-bare repository with linked worktrees as non-compliant whatever the occupancy", () => {
    const result = classifyWorktreePool(reading({ linkedWorktrees: true, running: 2, free: 3 }));
    expect(result.verdict).toBe(WORKTREE_POOL_VERDICT.NON_COMPLIANT);
  });

  it("reports the running and free counts as information and never degrades on free worktrees", () => {
    const running = 2;
    const free = 4;
    const result = classifyWorktreePool(reading({
      bareRepository: true,
      mainCheckoutPath: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      defaultBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      mainCheckoutBranch: sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.poolWorktreeName()),
      running,
      free,
    }));
    expect(result.verdict).toBe(WORKTREE_POOL_VERDICT.COMPLIANT);
    expect(result.bucket).toBe(VERDICT_BUCKET.HEALTHY);
    expect(result.readings.running).toBe(String(running));
    expect(result.readings.free).toBe(String(free));
  });
});
