/**
 * The worktree-pool diagnose check — classifies the git worktree layout and
 * reports how many worktrees are `running` versus `free` from the shared
 * worktree pool snapshot as information. Occupancy never degrades the verdict:
 * a `free` worktree — never claimed or holding a dead holder's residual claim —
 * is a healthy resting state, not a fault. The classification is pure over the
 * gathered reading; the reading is obtained through a dependency-injected probe
 * so the check verifies over controlled readings without a real repository.
 *
 * @module domains/diagnose/checks/worktree-pool
 */

import type { CheckRunner } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";

/** The worktree-pool verdict labels. */
export const WORKTREE_POOL_VERDICT = {
  COMPLIANT: "compliant",
  NON_COMPLIANT: "non-compliant",
  MAIN_CHECKOUT_MISSING: "main-checkout-missing",
  MAIN_CHECKOUT_DETACHED: "main-checkout-detached",
  MAIN_CHECKOUT_WRONG_BRANCH: "main-checkout-wrong-branch",
  UNKNOWN: "unknown",
} as const;

export type WorktreePoolVerdict = (typeof WORKTREE_POOL_VERDICT)[keyof typeof WORKTREE_POOL_VERDICT];

/** The reading the probe gathers about the worktree layout. */
export interface WorktreePoolReading {
  /** True when snapshot gathering errored. */
  readonly errored: boolean;
  /** True when the repository is bare (a worktree pool), false for a non-bare repository. */
  readonly bareRepository: boolean;
  /** True when linked worktrees are attached beyond the main working tree. */
  readonly linkedWorktrees: boolean;
  readonly mainCheckoutPath: string | null;
  readonly defaultBranch: string | null;
  readonly mainCheckoutBranch: string | null;
  readonly mainCheckoutBranchRead: boolean;
  /** The count of worktrees a live process holds (`running`). */
  readonly running: number;
  /** The count of worktrees with no live holder (`free`). */
  readonly free: number;
}

/** The injected boundary that gathers the worktree-pool reading. */
export interface WorktreePoolProbe {
  probe(): Promise<WorktreePoolReading>;
}

const REMEDIATION: Readonly<Record<WorktreePoolVerdict, string>> = {
  [WORKTREE_POOL_VERDICT.COMPLIANT]: "Worktree layout is compliant; no action needed.",
  [WORKTREE_POOL_VERDICT.NON_COMPLIANT]:
    "Linked worktrees require a bare-repository pool; convert the layout or remove the linked worktrees.",
  [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING]:
    "Create the repository-named main checkout beside the bare repository and attach it to the default branch.",
  [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED]:
    "Attach the designated main checkout to the repository default branch.",
  [WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH]:
    "Switch the designated main checkout to the repository default branch.",
  [WORKTREE_POOL_VERDICT.UNKNOWN]: "Re-run diagnose; if it persists, inspect git worktree list and occupancy claims.",
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
      mainCheckoutPath: reading.mainCheckoutPath ?? "",
      defaultBranch: reading.defaultBranch ?? "",
      mainCheckoutBranch: reading.mainCheckoutBranch ?? "",
      mainCheckoutBranchRead: String(reading.mainCheckoutBranchRead),
      running: String(reading.running),
      free: String(reading.free),
    },
    remediation: REMEDIATION[verdict],
  };
}

/**
 * Classifies the worktree-pool reading into a check record. The verdict is a
 * function of layout and canonical-checkout standing: invalid topology and an
 * unusable canonical checkout are broken, unavailable observations are
 * unknown, and occupancy remains informational. The `running`/`free` counts
 * never change the verdict.
 */
export function classifyWorktreePool(reading: WorktreePoolReading): CheckRecord {
  if (reading.errored) {
    return record(WORKTREE_POOL_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
  }
  if (!reading.bareRepository && reading.linkedWorktrees) {
    return record(WORKTREE_POOL_VERDICT.NON_COMPLIANT, VERDICT_BUCKET.BROKEN, reading);
  }
  if (reading.bareRepository) {
    if (reading.mainCheckoutPath === null) {
      return record(WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING, VERDICT_BUCKET.BROKEN, reading);
    }
    if (reading.defaultBranch === null || !reading.mainCheckoutBranchRead) {
      return record(WORKTREE_POOL_VERDICT.UNKNOWN, VERDICT_BUCKET.UNKNOWN, reading);
    }
    if (reading.mainCheckoutBranch === null) {
      return record(WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED, VERDICT_BUCKET.BROKEN, reading);
    }
    if (reading.mainCheckoutBranch !== reading.defaultBranch) {
      return record(WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH, VERDICT_BUCKET.BROKEN, reading);
    }
  }
  return record(WORKTREE_POOL_VERDICT.COMPLIANT, VERDICT_BUCKET.HEALTHY, reading);
}

/** Builds the worktree-pool check runner over an injected probe. */
export function worktreePoolRunner(probe: WorktreePoolProbe): CheckRunner {
  return async () => classifyWorktreePool(await probe.probe());
}
