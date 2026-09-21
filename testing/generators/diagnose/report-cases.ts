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
 * Each `*CheckFor` builder takes a source-owned verdict and returns the record
 * its check classifies for that verdict, so a linked test can range over the
 * verdict domain and keep the expected diagnosis heading in its own file. A
 * builder whose readings do not classify to the requested verdict raises a setup
 * error rather than returning a record the caller did not ask for.
 *
 * @module testing/generators/diagnose/report-cases
 */

import fc from "fast-check";

import {
  classifyMarketplaceInstall,
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallReading,
  type MarketplaceInstallVerdict,
} from "@/domains/diagnose/checks/marketplace-install";
import {
  classifySessionEnvironment,
  SESSION_ENVIRONMENT_VERDICT,
  type SessionEnvironmentReading,
  type SessionEnvironmentVerdict,
} from "@/domains/diagnose/checks/session-environment";
import {
  classifySessionStore,
  SESSION_STORE_VERDICT,
  type SessionStoreVerdict,
} from "@/domains/diagnose/checks/session-store";
import {
  classifySpxReachability,
  SPX_REACHABILITY_VERDICT,
  type SpxReachabilityReading,
  type SpxReachabilityVerdict,
} from "@/domains/diagnose/checks/spx-reachability";
import {
  classifyWorktreePool,
  WORKTREE_POOL_VERDICT,
  type WorktreePoolReading,
  type WorktreePoolVerdict,
} from "@/domains/diagnose/checks/worktree-pool";
import { type CheckRecord, type DiagnoseReport, OVERALL_VERDICT } from "@/domains/diagnose/types";
import { arbitraryBranchName, arbitraryPathSegment } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

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

export function workingSessionReading(): SessionEnvironmentReading {
  return { errored: false, hookPresent: true, sessionIdentity: true, worktreeClaimed: true };
}

export function configuredMarketplaceReading(): MarketplaceInstallReading {
  return { configured: true, errored: false, surfacePresent: true, unregistered: false, drifted: false };
}

export function sampleReport(): DiagnoseReport {
  return {
    checks: [
      spxCheckFor(SPX_REACHABILITY_VERDICT.PRESENT),
      sessionEnvironmentCheckFor(SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE),
      worktreePoolCheckFor(WORKTREE_POOL_VERDICT.COMPLIANT),
      sessionStoreCheckFor(SESSION_STORE_VERDICT.CONSISTENT),
      marketplaceCheckFor(MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE),
    ],
    overall: OVERALL_VERDICT.HEALTHY,
  };
}

/** Raises when a builder's readings do not classify to the verdict the caller asked for. */
function requireVerdict(record: CheckRecord, requested: string): CheckRecord {
  if (record.verdict !== requested) {
    throw new Error(`Generated readings classified as "${record.verdict}" rather than the requested "${requested}"`);
  }
  return record;
}

/** The spx-reachability record for one verdict, over a drawn path, version, and straddling floors. */
export function spxCheckFor(verdict: SpxReachabilityVerdict): CheckRecord {
  const floors = straddledFloor();
  const reading = {
    errored: false,
    resolvedPath: sampleGeneratedValue(arbitraryExecutablePath()),
    version: floors.version,
  };
  switch (verdict) {
    case SPX_REACHABILITY_VERDICT.REACHABLE:
      return requireVerdict(classifySpxReachability(reading, floors.floorBelow), verdict);
    case SPX_REACHABILITY_VERDICT.PRESENT:
      return requireVerdict(classifySpxReachability(reading, undefined), verdict);
    case SPX_REACHABILITY_VERDICT.BELOW_FLOOR:
      return requireVerdict(classifySpxReachability(reading, floors.floorAbove), verdict);
    case SPX_REACHABILITY_VERDICT.UNREACHABLE:
      return requireVerdict(classifySpxReachability({ ...reading, resolvedPath: null }, floors.floorBelow), verdict);
    case SPX_REACHABILITY_VERDICT.UNKNOWN:
      return requireVerdict(classifySpxReachability({ ...reading, errored: true }, floors.floorBelow), verdict);
  }
}

/** The session-environment record for one verdict, over the hook, identity, and claim flags that reach it. */
export function sessionEnvironmentCheckFor(verdict: SessionEnvironmentVerdict): CheckRecord {
  const reading = workingSessionReading();
  switch (verdict) {
    case SESSION_ENVIRONMENT_VERDICT.WORKING:
      return requireVerdict(classifySessionEnvironment(reading), verdict);
    case SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY:
      return requireVerdict(classifySessionEnvironment({ ...reading, worktreeClaimed: false }), verdict);
    case SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP:
      return requireVerdict(
        classifySessionEnvironment({ ...reading, sessionIdentity: false, worktreeClaimed: false }),
        verdict,
      );
    case SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE:
      return requireVerdict(
        classifySessionEnvironment({ ...reading, hookPresent: false, sessionIdentity: false, worktreeClaimed: false }),
        verdict,
      );
    case SESSION_ENVIRONMENT_VERDICT.UNKNOWN:
      return requireVerdict(
        classifySessionEnvironment({ ...reading, hookPresent: false, sessionIdentity: false }),
        verdict,
      );
  }
}

/** The worktree-pool record for one verdict, over the compliant pool reading perturbed to reach it. */
export function worktreePoolCheckFor(verdict: WorktreePoolVerdict): CheckRecord {
  const pool = compliantWorktreePoolReading();
  const [defaultBranch, wrongBranch] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
  switch (verdict) {
    case WORKTREE_POOL_VERDICT.COMPLIANT:
      return requireVerdict(classifyWorktreePool(pool), verdict);
    case WORKTREE_POOL_VERDICT.NON_COMPLIANT:
      return requireVerdict(
        classifyWorktreePool({
          ...pool,
          bareRepository: false,
          linkedWorktrees: true,
          mainCheckoutPath: null,
          defaultBranch: null,
          mainCheckoutBranch: null,
        }),
        verdict,
      );
    case WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING:
      return requireVerdict(
        classifyWorktreePool({ ...pool, mainCheckoutPath: null, defaultBranch, mainCheckoutBranch: null }),
        verdict,
      );
    case WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED:
      return requireVerdict(
        classifyWorktreePool({ ...pool, mainCheckoutPath: defaultBranch, defaultBranch, mainCheckoutBranch: null }),
        verdict,
      );
    case WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH:
      return requireVerdict(
        classifyWorktreePool({
          ...pool,
          mainCheckoutPath: defaultBranch,
          defaultBranch,
          mainCheckoutBranch: wrongBranch,
        }),
        verdict,
      );
    case WORKTREE_POOL_VERDICT.UNKNOWN:
      return requireVerdict(
        classifyWorktreePool({
          ...pool,
          errored: true,
          mainCheckoutPath: null,
          defaultBranch: null,
          mainCheckoutBranch: null,
          mainCheckoutBranchRead: false,
        }),
        verdict,
      );
  }
}

/** The session-store record for one verdict, over a drawn orphan count that never changes the verdict. */
export function sessionStoreCheckFor(verdict: SessionStoreVerdict): CheckRecord {
  switch (verdict) {
    case SESSION_STORE_VERDICT.CONSISTENT:
      return requireVerdict(classifySessionStore({ errored: false, orphanedClaims: orphanedClaimCount() }), verdict);
    case SESSION_STORE_VERDICT.UNKNOWN:
      return requireVerdict(classifySessionStore({ errored: true, orphanedClaims: 0 }), verdict);
  }
}

/** The marketplace-install record for one verdict, over the configured reading perturbed to reach it. */
export function marketplaceCheckFor(verdict: MarketplaceInstallVerdict): CheckRecord {
  const reading = configuredMarketplaceReading();
  switch (verdict) {
    case MARKETPLACE_INSTALL_VERDICT.INSTALLED:
      return requireVerdict(classifyMarketplaceInstall(reading), verdict);
    case MARKETPLACE_INSTALL_VERDICT.DRIFTED:
      return requireVerdict(classifyMarketplaceInstall({ ...reading, drifted: true }), verdict);
    case MARKETPLACE_INSTALL_VERDICT.UNREGISTERED:
      return requireVerdict(classifyMarketplaceInstall({ ...reading, unregistered: true }), verdict);
    case MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE:
      return requireVerdict(classifyMarketplaceInstall({ ...reading, surfacePresent: false }), verdict);
    case MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE:
      return requireVerdict(
        classifyMarketplaceInstall({ ...reading, configured: false, surfacePresent: false }),
        verdict,
      );
    case MARKETPLACE_INSTALL_VERDICT.UNKNOWN:
      return requireVerdict(classifyMarketplaceInstall({ ...reading, errored: true }), verdict);
  }
}
