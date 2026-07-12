/** Coherent generated scenarios for diagnose report assertions. */

import fc from "fast-check";

import { DEFAULT_METHODOLOGY_SOURCE } from "@/config/methodology";
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
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { type CanonicalCheckoutFailureVerdict } from "@/domains/diagnose/report-contract";
import {
  type CheckRecord,
  type DiagnoseReport,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

import { arbitraryInvalidSpxFloor, arbitraryNameToken, sampleDiagnoseTestValue } from "./manifest";

export interface TranslationBranchCase {
  readonly check: CheckRecord;
  readonly header: string;
}

export interface CanonicalCheckoutFailureCase {
  readonly check: CheckRecord;
  readonly verdict: CanonicalCheckoutFailureVerdict;
}

export interface InvalidDiagnoseReportCase {
  readonly name: string;
  readonly input: string;
}

export interface StyledBucketCase {
  readonly bucket: VerdictBucket;
  readonly report: DiagnoseReport;
}

export interface StyledOverallCase {
  readonly overall: OverallVerdict;
  readonly report: DiagnoseReport;
}

export interface DefaultDiagnoseScenario {
  readonly spx: SpxReachabilityReading;
  readonly sessionEnvironment: SessionEnvironmentReading;
  readonly worktreePool: WorktreePoolReading;
  readonly sessionStore: {
    readonly errored: boolean;
    readonly orphanedClaims: number;
  };
  readonly methodology: {
    readonly source: string;
    readonly version: string;
    readonly errored: boolean;
  };
}

interface OrderedVersions {
  readonly installed: string;
  readonly lower: string;
  readonly higher: string;
}

const arbitraryOrderedVersions = (): fc.Arbitrary<OrderedVersions> =>
  fc.tuple(fc.nat(98), fc.nat(98), fc.nat(98)).map(([major, minor, patch]) => ({
    installed: `${major}.${minor}.${patch + 1}`,
    lower: `${major}.${minor}.${patch}`,
    higher: `${major}.${minor}.${patch + 2}`,
  }));

function orderedVersions(): OrderedVersions {
  return sampleDiagnoseTestValue(arbitraryOrderedVersions());
}

export function reusableSpxReading(): SpxReachabilityReading {
  return {
    errored: false,
    resolvedPath: sampleDiagnoseTestValue(arbitraryNameToken()),
    version: orderedVersions().installed,
  };
}

export function workingSessionReading(): SessionEnvironmentReading {
  return { errored: false, hookPresent: true, sessionIdentity: true, worktreeClaimed: true };
}

export function configuredMarketplaceReading(): MarketplaceInstallReading {
  return { configured: true, errored: false, surfacePresent: true, unregistered: false, drifted: false };
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
    running: sampleDiagnoseTestValue(fc.nat()),
    free: sampleDiagnoseTestValue(fc.nat()),
  };
}

export function sampleDiagnoseReport(): DiagnoseReport {
  const checks = [
    classifySpxReachability(reusableSpxReading(), undefined),
    classifySessionEnvironment({
      errored: false,
      hookPresent: false,
      sessionIdentity: false,
      worktreeClaimed: false,
    }),
    classifyWorktreePool(compliantWorktreePoolReading()),
    classifySessionStore({ errored: false, orphanedClaims: sampleDiagnoseTestValue(fc.integer({ min: 1 })) }),
    classifyMarketplaceInstall({
      configured: false,
      errored: false,
      surfacePresent: false,
      unregistered: false,
      drifted: false,
    }),
  ];
  return { checks, overall: foldOverallVerdict(checks.map((check) => check.bucket)) };
}

export function defaultDiagnoseScenario(): DefaultDiagnoseScenario {
  return {
    spx: reusableSpxReading(),
    sessionEnvironment: {
      errored: false,
      hookPresent: false,
      sessionIdentity: false,
      worktreeClaimed: false,
    },
    worktreePool: compliantWorktreePoolReading(),
    sessionStore: { errored: false, orphanedClaims: 0 },
    methodology: {
      source: DEFAULT_METHODOLOGY_SOURCE,
      version: sampleDiagnoseTestValue(arbitraryOrderedVersions()).installed,
      errored: false,
    },
  };
}

export function canonicalCheckoutFailureCases(): readonly CanonicalCheckoutFailureCase[] {
  const [defaultBranch, wrongBranch] = sampleWorktreeTestValue(WORKTREE_TEST_GENERATOR.distinctPoolWorktreeNames());
  return [
    {
      check: classifyWorktreePool({
        ...compliantWorktreePoolReading(),
        mainCheckoutPath: null,
        defaultBranch,
        mainCheckoutBranch: null,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_MISSING,
    },
    {
      check: classifyWorktreePool({
        ...compliantWorktreePoolReading(),
        mainCheckoutPath: defaultBranch,
        defaultBranch,
        mainCheckoutBranch: null,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_DETACHED,
    },
    {
      check: classifyWorktreePool({
        ...compliantWorktreePoolReading(),
        mainCheckoutPath: defaultBranch,
        defaultBranch,
        mainCheckoutBranch: wrongBranch,
      }),
      verdict: WORKTREE_POOL_VERDICT.MAIN_CHECKOUT_WRONG_BRANCH,
    },
  ];
}

export function supportedTranslationBranches(): readonly TranslationBranchCase[] {
  const versions = orderedVersions();
  const spxReading = { ...reusableSpxReading(), version: versions.installed };
  const sessionReading = workingSessionReading();
  const marketplaceReading = configuredMarketplaceReading();
  return [
    { check: classifySpxReachability(spxReading, versions.lower), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, undefined), header: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED },
    { check: classifySpxReachability(spxReading, versions.higher), header: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR },
    {
      check: classifySpxReachability({ ...spxReading, resolvedPath: null }, versions.lower),
      header: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
    },
    {
      check: classifySpxReachability({ ...spxReading, errored: true }, versions.lower),
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
        ...compliantWorktreePoolReading(),
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
      check: classifyWorktreePool({ ...compliantWorktreePoolReading(), errored: true }),
      header: DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: 0 }),
      header: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    },
    {
      check: classifySessionStore({ errored: false, orphanedClaims: sampleDiagnoseTestValue(fc.integer({ min: 1 })) }),
      header: DIAGNOSE_TEXT_HEADER.STALE_DOING_SESSIONS,
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

export function invalidSpxVersionCase(): { readonly check: CheckRecord; readonly floor: string } {
  const floor = sampleDiagnoseTestValue(arbitraryInvalidSpxFloor());
  return { check: classifySpxReachability(reusableSpxReading(), floor), floor };
}

export function marketplaceCliProblemCheck(): CheckRecord {
  return classifyMarketplaceInstall({ ...configuredMarketplaceReading(), surfacePresent: false });
}

export function sessionStartNoOpCheck(): CheckRecord {
  return classifySessionEnvironment({
    errored: false,
    hookPresent: true,
    sessionIdentity: false,
    worktreeClaimed: false,
  });
}

export function invalidDiagnoseReportCases(): readonly InvalidDiagnoseReportCase[] {
  const report = sampleDiagnoseReport();
  const firstCheck = report.checks[0];
  const secondCheck = report.checks[1];
  return [
    { name: "malformed JSON", input: "{" },
    { name: "missing checks field", input: JSON.stringify({ overall: report.overall }) },
    { name: "missing overall field", input: JSON.stringify({ checks: report.checks }) },
    { name: "non-array checks", input: JSON.stringify({ ...report, checks: {} }) },
    { name: "invalid overall verdict", input: JSON.stringify({ ...report, overall: report.overall.toUpperCase() }) },
    { name: "non-string overall verdict", input: JSON.stringify({ ...report, overall: 1 }) },
    {
      name: "non-string check name",
      input: JSON.stringify({ ...report, checks: [{ ...firstCheck, name: 1 }, ...report.checks.slice(1)] }),
    },
    {
      name: "invalid check name",
      input: JSON.stringify({
        ...report,
        checks: [{ ...firstCheck, name: firstCheck.name.toUpperCase() }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "invalid check verdict",
      input: JSON.stringify({
        ...report,
        checks: [{ ...firstCheck, verdict: firstCheck.verdict.toUpperCase() }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "non-string check verdict",
      input: JSON.stringify({ ...report, checks: [{ ...firstCheck, verdict: 1 }, ...report.checks.slice(1)] }),
    },
    {
      name: "cross-provider check verdict",
      input: JSON.stringify({
        ...report,
        checks: [{ ...firstCheck, verdict: secondCheck.verdict }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "non-string check bucket",
      input: JSON.stringify({ ...report, checks: [{ ...firstCheck, bucket: 1 }, ...report.checks.slice(1)] }),
    },
    {
      name: "invalid check bucket",
      input: JSON.stringify({
        ...report,
        checks: [{ ...firstCheck, bucket: firstCheck.bucket.toUpperCase() }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "non-object readings",
      input: JSON.stringify({ ...report, checks: [{ ...firstCheck, readings: [] }, ...report.checks.slice(1)] }),
    },
    {
      name: "non-string reading",
      input: JSON.stringify({
        ...report,
        checks: [{ ...firstCheck, readings: { invalid: 1 } }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "non-string remediation",
      input: JSON.stringify({ ...report, checks: [{ ...firstCheck, remediation: 1 }, ...report.checks.slice(1)] }),
    },
    {
      name: "missing check name",
      input: JSON.stringify({
        ...report,
        checks: [{
          verdict: firstCheck.verdict,
          bucket: firstCheck.bucket,
          readings: firstCheck.readings,
          remediation: firstCheck.remediation,
        }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "missing check verdict",
      input: JSON.stringify({
        ...report,
        checks: [{
          name: firstCheck.name,
          bucket: firstCheck.bucket,
          readings: firstCheck.readings,
          remediation: firstCheck.remediation,
        }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "missing check bucket",
      input: JSON.stringify({
        ...report,
        checks: [{
          name: firstCheck.name,
          verdict: firstCheck.verdict,
          readings: firstCheck.readings,
          remediation: firstCheck.remediation,
        }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "missing readings",
      input: JSON.stringify({
        ...report,
        checks: [{
          name: firstCheck.name,
          verdict: firstCheck.verdict,
          bucket: firstCheck.bucket,
          remediation: firstCheck.remediation,
        }, ...report.checks.slice(1)],
      }),
    },
    {
      name: "missing remediation",
      input: JSON.stringify({
        ...report,
        checks: [{
          name: firstCheck.name,
          verdict: firstCheck.verdict,
          bucket: firstCheck.bucket,
          readings: firstCheck.readings,
        }, ...report.checks.slice(1)],
      }),
    },
  ];
}

function reportForCheck(check: CheckRecord): DiagnoseReport {
  return { checks: [check], overall: foldOverallVerdict([check.bucket]) };
}

export function styledBucketCases(): readonly StyledBucketCase[] {
  const versions = orderedVersions();
  return [
    {
      bucket: VERDICT_BUCKET.HEALTHY,
      report: reportForCheck(classifySpxReachability(reusableSpxReading(), undefined)),
    },
    {
      bucket: VERDICT_BUCKET.DEGRADED,
      report: reportForCheck(classifySpxReachability(reusableSpxReading(), versions.higher)),
    },
    {
      bucket: VERDICT_BUCKET.UNKNOWN,
      report: reportForCheck(classifySpxReachability({ ...reusableSpxReading(), errored: true }, versions.lower)),
    },
    {
      bucket: VERDICT_BUCKET.BROKEN,
      report: reportForCheck(classifySpxReachability({ ...reusableSpxReading(), resolvedPath: null }, versions.lower)),
    },
    {
      bucket: VERDICT_BUCKET.NOT_APPLICABLE,
      report: reportForCheck(
        classifyMarketplaceInstall({
          configured: false,
          errored: false,
          surfacePresent: false,
          unregistered: false,
          drifted: false,
        }),
      ),
    },
  ];
}

export function styledOverallCases(): readonly StyledOverallCase[] {
  return styledBucketCases()
    .filter((testCase) => testCase.bucket !== VERDICT_BUCKET.NOT_APPLICABLE)
    .map((testCase) => ({ overall: testCase.report.overall, report: testCase.report }));
}

export const INVALID_DIAGNOSE_REPORT_CASES = invalidDiagnoseReportCases();
export const STYLED_BUCKET_CASES = styledBucketCases();
export const STYLED_OVERALL_CASES = styledOverallCases();
