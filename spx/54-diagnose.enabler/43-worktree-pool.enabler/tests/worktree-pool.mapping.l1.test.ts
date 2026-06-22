import { describe, expect, it } from "vitest";

import {
  classifyWorktreePool,
  WORKTREE_POOL_VERDICT,
  type WorktreePoolReading,
} from "@/domains/diagnose/checks/worktree-pool";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";

const reading = (overrides: Partial<WorktreePoolReading>): WorktreePoolReading => ({
  errored: false,
  bareRepository: false,
  linkedWorktrees: false,
  staleClaim: false,
  ...overrides,
});

describe("the worktree-pool check classifies the layout from git worktree list and occupancy", () => {
  it.each([
    { overrides: { errored: true }, verdict: WORKTREE_POOL_VERDICT.UNKNOWN, bucket: VERDICT_BUCKET.UNKNOWN },
    {
      overrides: { bareRepository: false, linkedWorktrees: true },
      verdict: WORKTREE_POOL_VERDICT.NON_COMPLIANT,
      bucket: VERDICT_BUCKET.BROKEN,
    },
    {
      overrides: { bareRepository: true, staleClaim: true },
      verdict: WORKTREE_POOL_VERDICT.STALE_CLAIMS,
      bucket: VERDICT_BUCKET.DEGRADED,
    },
    { overrides: { staleClaim: true }, verdict: WORKTREE_POOL_VERDICT.STALE_CLAIMS, bucket: VERDICT_BUCKET.DEGRADED },
    { overrides: { bareRepository: true }, verdict: WORKTREE_POOL_VERDICT.COMPLIANT, bucket: VERDICT_BUCKET.HEALTHY },
    { overrides: {}, verdict: WORKTREE_POOL_VERDICT.COMPLIANT, bucket: VERDICT_BUCKET.HEALTHY },
  ])("classifies the worktree layout as $verdict (bucket $bucket)", ({ overrides, verdict, bucket }) => {
    const result = classifyWorktreePool(reading(overrides));
    expect(result.verdict).toBe(verdict);
    expect(result.bucket).toBe(bucket);
    expect(result.remediation.length).toBeGreaterThan(0);
  });

  it("ranks a non-bare repository with linked worktrees as non-compliant even when a claim is stale", () => {
    const result = classifyWorktreePool(reading({ linkedWorktrees: true, staleClaim: true }));
    expect(result.verdict).toBe(WORKTREE_POOL_VERDICT.NON_COMPLIANT);
  });
});
