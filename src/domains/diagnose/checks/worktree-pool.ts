/**
 * The worktree-pool diagnose check — classifies the git worktree layout from
 * `git worktree list` and the per-worktree `spx worktree status` occupancy. The
 * classification is pure over the gathered reading; the reading is obtained
 * through a dependency-injected probe so the check verifies over controlled
 * readings without a real repository.
 *
 * @module domains/diagnose/checks/worktree-pool
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The worktree-pool verdict labels. */
export const WORKTREE_POOL_VERDICT = {
  COMPLIANT: "compliant",
  STALE_CLAIMS: "stale-claims",
  NON_COMPLIANT: "non-compliant",
  UNKNOWN: "unknown",
} as const;

export type WorktreePoolVerdict = (typeof WORKTREE_POOL_VERDICT)[keyof typeof WORKTREE_POOL_VERDICT];

/** The reading the probe gathers about the worktree layout. */
export interface WorktreePoolReading {
  /** True when a `git worktree list` or `spx worktree status` command errored. */
  readonly errored: boolean;
  /** True when the repository is bare (a worktree pool), false for a non-bare repository. */
  readonly bareRepository: boolean;
  /** True when linked worktrees are attached beyond the main working tree. */
  readonly linkedWorktrees: boolean;
  /** True when any worktree's occupancy is stale. */
  readonly staleClaim: boolean;
}

/** The injected boundary that gathers the worktree-pool reading. */
export interface WorktreePoolProbe {
  probe(): Promise<WorktreePoolReading>;
}

const REMEDIATION: Readonly<Record<WorktreePoolVerdict, string>> = {
  [WORKTREE_POOL_VERDICT.COMPLIANT]: "Worktree layout is compliant; no action needed.",
  [WORKTREE_POOL_VERDICT.STALE_CLAIMS]:
    "Release stale worktree claims (spx worktree release) or remove dead worktrees.",
  [WORKTREE_POOL_VERDICT.NON_COMPLIANT]:
    "Linked worktrees require a bare-repository pool; convert the layout or remove the linked worktrees.",
  [WORKTREE_POOL_VERDICT.UNKNOWN]:
    "Re-run diagnose; if it persists, inspect git worktree list and spx worktree status.",
};

function record(
  verdict: WorktreePoolVerdict,
  bucket: CheckRecord["bucket"],
  reading: WorktreePoolReading,
): CheckRecord {
  return {
    name: CHECK_NAME.WORKTREE_POOL,
    verdict,
    bucket,
    readings: {
      bare: String(reading.bareRepository),
      linked: String(reading.linkedWorktrees),
      stale: String(reading.staleClaim),
    },
    remediation: REMEDIATION[verdict],
  };
}

/** Classifies the worktree-pool reading into a check record. */
export function classifyWorktreePool(reading: WorktreePoolReading): CheckRecord {
  if (reading.errored) {
    return record(WORKTREE_POOL_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (!reading.bareRepository && reading.linkedWorktrees) {
    return record(WORKTREE_POOL_VERDICT.NON_COMPLIANT, VERDICT_BUCKET.BROKEN, reading);
  }
  if (reading.staleClaim) {
    return record(WORKTREE_POOL_VERDICT.STALE_CLAIMS, VERDICT_BUCKET.DEGRADED, reading);
  }
  return record(WORKTREE_POOL_VERDICT.COMPLIANT, VERDICT_BUCKET.HEALTHY, reading);
}

/** Builds the worktree-pool check runner over an injected probe. */
export function worktreePoolRunner(probe: WorktreePoolProbe): CheckRunner {
  return async () => classifyWorktreePool(await probe.probe());
}
