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
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

interface TranslationBranchCase {
  readonly check: CheckRecord;
  readonly header: string;
}

interface CanonicalCheckoutFailureCase {
  readonly check: CheckRecord;
  readonly verdict: CanonicalCheckoutFailureVerdict;
}

export function compliantWorktreePoolReading(): WorktreePoolReading {
  const branch = sampleMainCheckoutTestValue(arbitraryBranchName());
  return {
    errored: false,
    bareRepository: true,
    linkedWorktrees: false,
    mainCheckoutPath: branch,
    defaultBranch: branch,
    mainCheckoutBranch: branch,
    mainCheckoutBranchRead: true,
    running: 1,
    free: 8,
  };
}

export function sampleReport(): DiagnoseReport {
  return {
    checks: [
      classifySpxReachability({ errored: false, resolvedPath: "/bin/spx", version: "0.6.8" }, undefined),
      classifySessionEnvironment({
        errored: false,
        hookPresent: false,
        sessionIdentity: false,
        worktreeClaimed: false,
      }),
      classifyWorktreePool(compliantWorktreePoolReading()),
      classifySessionStore({ errored: false, orphanedClaims: 11 }),
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

export function reusableSpxReading(): SpxReachabilityReading {
  return { errored: false, resolvedPath: "/bin/spx", version: "0.6.8" };
}

export function workingSessionReading(): SessionEnvironmentReading {
  return { errored: false, hookPresent: true, sessionIdentity: true, worktreeClaimed: true };
}

export function configuredMarketplaceReading(): MarketplaceInstallReading {
  return { configured: true, errored: false, surfacePresent: true, unregistered: false, drifted: false };
}

export function canonicalCheckoutFailureCases(): readonly CanonicalCheckoutFailureCase[] {
  const [defaultBranch, wrongBranch] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
  return [
    {
      check: classifyWorktreePool({
        errored: false,
        bareRepository: true,
        linkedWorktrees: false,
        mainCheckoutPath: null,
        defaultBranch,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: true,
        running: 1,
        free: 8,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING,
    },
    {
      check: classifyWorktreePool({
        errored: false,
        bareRepository: true,
        linkedWorktrees: false,
        mainCheckoutPath: defaultBranch,
        defaultBranch,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: true,
        running: 1,
        free: 8,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED,
    },
    {
      check: classifyWorktreePool({
        errored: false,
        bareRepository: true,
        linkedWorktrees: false,
        mainCheckoutPath: defaultBranch,
        defaultBranch,
        mainCheckoutBranch: wrongBranch,
        mainCheckoutBranchRead: true,
        running: 1,
        free: 8,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH,
    },
  ];
}

export function supportedTranslationBranches(): readonly TranslationBranchCase[] {
  const spxReading = reusableSpxReading();
  const sessionReading = workingSessionReading();
  const marketplaceReading = configuredMarketplaceReading();
  return [
    { check: classifySpxReachability(spxReading, "0.6.0"), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, undefined), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, "0.7.0"), header: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR },
    {
      check: classifySpxReachability({ ...spxReading, resolvedPath: null }, "0.6.0"),
      header: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
    },
    {
      check: classifySpxReachability({ ...spxReading, errored: true }, "0.6.0"),
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
    { check: classifyWorktreePool(compliantWorktreePoolReading()), header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID },
    {
      check: classifyWorktreePool({
        errored: false,
        bareRepository: false,
        linkedWorktrees: true,
        mainCheckoutPath: null,
        defaultBranch: null,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: true,
        running: 1,
        free: 8,
      }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    },
    ...canonicalCheckoutFailureCases().map(({ check }) => ({
      check,
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    })),
    {
      check: classifyWorktreePool({
        errored: true,
        bareRepository: true,
        linkedWorktrees: false,
        mainCheckoutPath: null,
        defaultBranch: null,
        mainCheckoutBranch: null,
        mainCheckoutBranchRead: false,
        running: 1,
        free: 8,
      }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: 0 }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: 11 }),
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
