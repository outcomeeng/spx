/**
 * Generators for the check records the report renderings are judged over.
 *
 * Every verdict branch of every check is reachable by many readings, so the
 * readings are drawn from their domains rather than pinned: only the flags that
 * select a branch are fixed, because the branch is what each case is about. The
 * spx-reachability floor cases are constructed from semver ordering — a floor
 * one patch below the drawn version and one patch above it — so the boundary is
 * derived rather than chosen, and the construction never consults `meetsFloor`.
 *
 * @module testing/generators/diagnose/report-cases
 */

import fc from "fast-check";

import {
  classifyMarketplaceInstall,
  type MarketplaceInstallReading,
} from "@/domains/diagnose/checks/marketplace-install";
import {
  classifySessionEnvironment,
  type SessionEnvironmentReading,
} from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore } from "@/domains/diagnose/checks/session-store";
import { classifySpxReachability, type SpxReachabilityReading } from "@/domains/diagnose/checks/spx-reachability";
import {
  classifyWorktreePool,
  WORKTREE_POOL_VERDICT,
  type WorktreePoolReading,
} from "@/domains/diagnose/checks/worktree-pool";
import { DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import type { CanonicalCheckoutFailureVerdict } from "@/domains/diagnose/report-contract";
import { type CheckRecord, type DiagnoseReport, OVERALL_VERDICT } from "@/domains/diagnose/types";
import { arbitraryBranchName, arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

interface TranslationBranchCase {
  readonly check: CheckRecord;
  readonly header: string;
}

interface CanonicalCheckoutFailureCase {
  readonly check: CheckRecord;
  readonly verdict: CanonicalCheckoutFailureVerdict;
}

/** A version with the floors that straddle it, ordered by semver precedence on the patch component alone. */
export interface StraddledFloorCase {
  readonly version: string;
  /** Strictly below `version`, so a reachable classification follows. */
  readonly floorBelow: string;
  /** Strictly above `version`, so a below-floor classification follows. */
  readonly floorAbove: string;
}

/** An absolute POSIX path of drawn segments — the shape a resolved executable path takes. */
export const arbitraryExecutablePath = (): fc.Arbitrary<string> =>
  fc.array(arbitraryPathSegment(), { minLength: 1, maxLength: 4 }).map((segments) => `/${segments.join("/")}`);

/**
 * A version and the two floors that straddle it. The patch component is drawn
 * away from both ends of its range so the neighbouring patches exist, making the
 * ordering a fact of the construction rather than of the comparison under test.
 */
export const arbitraryStraddledFloor = (): fc.Arbitrary<StraddledFloorCase> =>
  fc
    .tuple(fc.nat(99), fc.nat(99), fc.integer({ min: 1, max: 98 }))
    .map(([major, minor, patch]) => ({
      version: `${major}.${minor}.${patch}`,
      floorBelow: `${major}.${minor}.${patch - 1}`,
      floorAbove: `${major}.${minor}.${patch + 1}`,
    }));

/** A reachable spx reading: a resolved path and a readable version, both drawn. */
export const arbitrarySpxReading = (): fc.Arbitrary<SpxReachabilityReading> =>
  fc
    .tuple(arbitraryExecutablePath(), arbitraryStraddledFloor())
    .map(([resolvedPath, floors]) => ({ errored: false, resolvedPath, version: floors.version }));

/** A pool reading whose worktree counts are drawn; the compliant flag combination is the case. */
export const arbitraryCompliantWorktreePoolReading = (): fc.Arbitrary<WorktreePoolReading> =>
  fc
    .tuple(fc.nat(99), fc.nat(99))
    .map(([running, free]) => {
      const branch = sampleMainCheckoutTestValue(arbitraryBranchName());
      return {
        errored: false,
        bareRepository: true,
        linkedWorktrees: false,
        mainCheckoutPath: branch,
        defaultBranch: branch,
        mainCheckoutBranch: branch,
        mainCheckoutBranchRead: true,
        running,
        free,
      };
    });

export function compliantWorktreePoolReading(): WorktreePoolReading {
  return sampleGeneratedValue(arbitraryCompliantWorktreePoolReading());
}

export function straddledFloor(): StraddledFloorCase {
  return sampleGeneratedValue(arbitraryStraddledFloor());
}

export function reusableSpxReading(): SpxReachabilityReading {
  return sampleGeneratedValue(arbitrarySpxReading());
}

/** A drawn count of orphaned doing-sessions; the informational reading never changes the verdict. */
export function orphanedClaimCount(): number {
  return sampleGeneratedValue(fc.integer({ min: 1, max: 99 }));
}

export function sampleReport(): DiagnoseReport {
  return {
    checks: [
      classifySpxReachability(reusableSpxReading(), undefined),
      classifySessionEnvironment({
        errored: false,
        hookPresent: false,
        sessionIdentity: false,
        worktreeClaimed: false,
      }),
      classifyWorktreePool(compliantWorktreePoolReading()),
      classifySessionStore({ errored: false, orphanedClaims: orphanedClaimCount() }),
      classifyMarketplaceInstall({
        configured: false,
        errored: false,
        surfacePresent: false,
        unregistered: false,
        drifted: false,
      }),
    ],
    overall: OVERALL_VERDICT.HEALTHY,
  };
}

export function workingSessionReading(): SessionEnvironmentReading {
  return { errored: false, hookPresent: true, sessionIdentity: true, worktreeClaimed: true };
}

export function configuredMarketplaceReading(): MarketplaceInstallReading {
  return { configured: true, errored: false, surfacePresent: true, unregistered: false, drifted: false };
}

export function canonicalCheckoutFailureCases(): readonly CanonicalCheckoutFailureCase[] {
  const [defaultBranch, wrongBranch] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
  const pool = compliantWorktreePoolReading();
  return [
    {
      check: classifyWorktreePool({ ...pool, mainCheckoutPath: null, defaultBranch, mainCheckoutBranch: null }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING,
    },
    {
      check: classifyWorktreePool({
        ...pool,
        mainCheckoutPath: defaultBranch,
        defaultBranch,
        mainCheckoutBranch: null,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED,
    },
    {
      check: classifyWorktreePool({
        ...pool,
        mainCheckoutPath: defaultBranch,
        defaultBranch,
        mainCheckoutBranch: wrongBranch,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH,
    },
  ];
}

export function supportedTranslationBranches(): readonly TranslationBranchCase[] {
  const floors = straddledFloor();
  const spxReading = {
    errored: false,
    resolvedPath: sampleGeneratedValue(arbitraryExecutablePath()),
    version: floors.version,
  };
  const sessionReading = workingSessionReading();
  const marketplaceReading = configuredMarketplaceReading();
  const pool = compliantWorktreePoolReading();
  return [
    { check: classifySpxReachability(spxReading, floors.floorBelow), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, undefined), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, floors.floorAbove), header: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR },
    {
      check: classifySpxReachability({ ...spxReading, resolvedPath: null }, floors.floorBelow),
      header: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
    },
    {
      check: classifySpxReachability({ ...spxReading, errored: true }, floors.floorBelow),
      header: DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN,
    },
    { check: classifySessionEnvironment(sessionReading), header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_ACTIVE },
    {
      check: classifySessionEnvironment({ ...sessionReading, worktreeClaimed: false }),
      header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNLINKED,
    },
    {
      check: classifySessionEnvironment({ ...sessionReading, sessionIdentity: false, worktreeClaimed: false }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP,
    },
    {
      check: classifySessionEnvironment({
        ...sessionReading,
        hookPresent: false,
        sessionIdentity: false,
        worktreeClaimed: false,
      }),
      header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED,
    },
    {
      check: classifySessionEnvironment({ ...sessionReading, hookPresent: false, sessionIdentity: false }),
      header: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNKNOWN,
    },
    { check: classifyWorktreePool(pool), header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID },
    {
      check: classifyWorktreePool({
        ...pool,
        bareRepository: false,
        linkedWorktrees: true,
        mainCheckoutPath: null,
        defaultBranch: null,
        mainCheckoutBranch: null,
      }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    },
    ...canonicalCheckoutFailureCases().map(({ check }) => ({
      check,
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    })),
    {
      check: classifyWorktreePool({
        ...pool,
        errored: true,
        mainCheckoutPath: null,
        defaultBranch: null,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: false,
      }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: 0 }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: orphanedClaimCount() }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    },
    {
      check: classifySessionStore({ errored: true, orphanedClaims: 0 }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_UNKNOWN,
    },
    { check: classifyMarketplaceInstall(marketplaceReading), header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CONFIGURED },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, drifted: true }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_DRIFT,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, unregistered: true }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNREGISTERED,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, surfacePresent: false }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, configured: false, surfacePresent: false }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED,
    },
    {
      check: classifyMarketplaceInstall({ ...marketplaceReading, errored: true }),
      header: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNKNOWN,
    },
  ];
}
