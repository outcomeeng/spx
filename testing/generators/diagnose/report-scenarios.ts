/** Coherent generated scenarios for diagnose report assertions. */

import fc from "fast-check";

import { DEFAULT_METHODOLOGY_SOURCE } from "@/config/methodology";
import {
  classifyMarketplaceInstall,
  MARKETPLACE_INSTALL_VERDICT,
  type MarketplaceInstallReading,
} from "@/domains/diagnose/checks/marketplace-install";
import { classifyMethodologyContext, METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import {
  classifySessionEnvironment,
  SESSION_ENVIRONMENT_VERDICT,
  type SessionEnvironmentReading,
} from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore, SESSION_STORE_VERDICT } from "@/domains/diagnose/checks/session-store";
import {
  classifySpxReachability,
  SPX_REACHABILITY_VERDICT,
  type SpxReachabilityReading,
} from "@/domains/diagnose/checks/spx-reachability";
import {
  classifyWorktreePool,
  WORKTREE_POOL_VERDICT,
  type WorktreePoolReading,
} from "@/domains/diagnose/checks/worktree-pool";
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { type CanonicalCheckoutFailureVerdict, CHECK_VERDICT_BUCKET } from "@/domains/diagnose/report-contract";
import {
  CHECK_RECORD_FIELDS,
  type CheckRecord,
  DIAGNOSE_REPORT_FIELDS,
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";
import { SEVERITY, type Severity } from "@/lib/styled-output/styled-output";
import { SPX_VERSION } from "@/version";
import { arbitraryBranchName } from "@testing/generators/git-name/git-name";
import { sampleMainCheckoutTestValue } from "@testing/generators/main-checkout/main-checkout";
import { sampleWorktreeTestValue, WORKTREE_TEST_GENERATOR } from "@testing/generators/worktree/worktree";

import { arbitraryInvalidSpxFloor, arbitraryNameToken, arbitrarySpxFloor, sampleDiagnoseTestValue } from "./manifest";
import {
  mismatchedMethodologyScenario,
  resolvedMethodologyScenario,
  unavailableMethodologyScenario,
  unknownMethodologyScenario,
} from "./methodology-context";

export interface TranslationBranchCase {
  readonly check: CheckRecord;
  readonly header: string;
}

export interface HumanHeaderCheck {
  readonly name: string;
  readonly verdict: string;
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
  readonly expectedSeverity: Severity;
  readonly report: DiagnoseReport;
}

export interface StyledOverallCase {
  readonly overall: OverallVerdict;
  readonly expectedSeverity: Severity;
  readonly report: DiagnoseReport;
}

export interface DiagnoseExitCodeCase {
  readonly overall: OverallVerdict;
  readonly expectedCode: number;
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

export interface AllProviderRecordScenario {
  readonly records: readonly CheckRecord[];
  readonly forbiddenConciseReadings: readonly string[];
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
  const largeReadingMinimum = Math.floor(Number.MAX_SAFE_INTEGER / 2);
  const [running, free] = sampleDiagnoseTestValue(
    fc.tuple(
      fc.integer({ min: largeReadingMinimum, max: Number.MAX_SAFE_INTEGER }),
      fc.integer({ min: largeReadingMinimum, max: Number.MAX_SAFE_INTEGER }),
    ).filter(([left, right]) => left !== right),
  );
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

export function allProviderRecordScenario(): AllProviderRecordScenario {
  const methodology = resolvedMethodologyScenario();
  const spxRecord = classifySpxReachability({
    ...reusableSpxReading(),
    resolvedPath: sampleDiagnoseTestValue(fc.nat(Number.MAX_SAFE_INTEGER).map((value) => `/diagnose-path-${value}`)),
    version: sampleDiagnoseTestValue(arbitrarySpxFloor().filter((version) => version !== SPX_VERSION)),
  }, undefined);
  const records = [
    spxRecord,
    classifySessionEnvironment({
      errored: false,
      hookPresent: true,
      sessionIdentity: true,
      worktreeClaimed: false,
    }),
    classifyWorktreePool(compliantWorktreePoolReading()),
    classifySessionStore({
      errored: false,
      orphanedClaims: sampleDiagnoseTestValue(
        fc.integer({ min: Math.floor(Number.MAX_SAFE_INTEGER / 2), max: Number.MAX_SAFE_INTEGER }),
      ),
    }),
    classifyMarketplaceInstall({
      configured: false,
      errored: false,
      surfacePresent: false,
      unregistered: false,
      drifted: false,
    }),
    classifyMethodologyContext({
      configured: true,
      configuredSource: methodology.methodology.source,
      configuredVersion: methodology.methodology.version,
      observedSource: methodology.observation.source,
      observedVersion: methodology.observation.version,
      errored: methodology.observation.errored,
    }),
  ];
  const orderedRecords = Object.values(CHECK_NAME).map((name) => {
    const record = records.find((candidate) => candidate.name === name);
    if (record === undefined) throw new Error(`no generated diagnose record for ${name}`);
    return record;
  });
  const forbiddenConciseReadings = orderedRecords.flatMap((record) => Object.values(record.readings));
  return { records: orderedRecords, forbiddenConciseReadings };
}

export function allProviderRecords(): readonly CheckRecord[] {
  return allProviderRecordScenario().records;
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

const HUMAN_HEADER_BY_VERDICT: Readonly<Partial<Record<string, Readonly<Partial<Record<string, string>>>>>> = {
  [CHECK_NAME.SPX_REACHABILITY]: {
    [SPX_REACHABILITY_VERDICT.REACHABLE]: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
    [SPX_REACHABILITY_VERDICT.PRESENT]: DIAGNOSE_TEXT_HEADER.SPX_INSTALLED,
    [SPX_REACHABILITY_VERDICT.BELOW_FLOOR]: DIAGNOSE_TEXT_HEADER.SPX_BELOW_FLOOR,
    [SPX_REACHABILITY_VERDICT.UNREACHABLE]: DIAGNOSE_TEXT_HEADER.SPX_UNREACHABLE,
    [SPX_REACHABILITY_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.SPX_UNKNOWN,
  },
  [CHECK_NAME.SESSION_ENVIRONMENT]: {
    [SESSION_ENVIRONMENT_VERDICT.WORKING]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_ACTIVE,
    [SESSION_ENVIRONMENT_VERDICT.IDENTITY_ONLY]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNLINKED,
    [SESSION_ENVIRONMENT_VERDICT.SILENT_NO_OP]: DIAGNOSE_TEXT_HEADER.SESSION_START_NO_OP,
    [SESSION_ENVIRONMENT_VERDICT.NOT_APPLICABLE]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_HOOK_SKIPPED,
    [SESSION_ENVIRONMENT_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.AGENT_SESSION_UNKNOWN,
  },
  [CHECK_NAME.WORKTREE_POOL]: Object.fromEntries(
    Object.keys(CHECK_VERDICT_BUCKET[CHECK_NAME.WORKTREE_POOL]).map((verdict) => [
      verdict,
      verdict === WORKTREE_POOL_VERDICT.COMPLIANT
        ? DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_VALID
        : verdict === WORKTREE_POOL_VERDICT.UNKNOWN
        ? DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_UNKNOWN
        : DIAGNOSE_TEXT_HEADER.WORKTREE_POOL_INVALID,
    ]),
  ),
  [CHECK_NAME.SESSION_STORE]: {
    [SESSION_STORE_VERDICT.CONSISTENT]: DIAGNOSE_TEXT_HEADER.SESSION_STORE_CLEAN,
    [SESSION_STORE_VERDICT.ORPHANED_CLAIMS]: DIAGNOSE_TEXT_HEADER.STALE_DOING_SESSIONS,
    [SESSION_STORE_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.SESSION_STORE_UNKNOWN,
  },
  [CHECK_NAME.MARKETPLACE_INSTALL]: {
    [MARKETPLACE_INSTALL_VERDICT.INSTALLED]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CONFIGURED,
    [MARKETPLACE_INSTALL_VERDICT.DRIFTED]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_DRIFT,
    [MARKETPLACE_INSTALL_VERDICT.UNREGISTERED]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNREGISTERED,
    [MARKETPLACE_INSTALL_VERDICT.CLI_UNAVAILABLE]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CLI_UNAVAILABLE,
    [MARKETPLACE_INSTALL_VERDICT.NOT_APPLICABLE]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_CHECKS_SKIPPED,
    [MARKETPLACE_INSTALL_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.MARKETPLACE_UNKNOWN,
  },
  [CHECK_NAME.METHODOLOGY_CONTEXT]: {
    [METHODOLOGY_CONTEXT_VERDICT.RESOLVED]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED,
    [METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_VERSION_MISMATCH,
    [METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNAVAILABLE,
    [METHODOLOGY_CONTEXT_VERDICT.UNKNOWN]: DIAGNOSE_TEXT_HEADER.METHODOLOGY_UNKNOWN,
  },
};

export function expectedHumanHeader(check: HumanHeaderCheck): string {
  return HUMAN_HEADER_BY_VERDICT[check.name]?.[check.verdict] ?? DIAGNOSE_TEXT_HEADER.RENDERING_UNAVAILABLE;
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
  const [checksField, overallField] = DIAGNOSE_REPORT_FIELDS;
  const methodologyRecord = ({ methodology, observation }: ReturnType<typeof resolvedMethodologyScenario>) =>
    classifyMethodologyContext({
      configured: true,
      configuredSource: methodology.source,
      configuredVersion: methodology.version,
      observedSource: observation.source,
      observedVersion: observation.version,
      errored: observation.errored,
    });
  const providerRecords = [
    ...supportedTranslationBranches().map(({ check }) => check),
    methodologyRecord(resolvedMethodologyScenario()),
    methodologyRecord(mismatchedMethodologyScenario()),
    methodologyRecord(unavailableMethodologyScenario()),
    methodologyRecord(unknownMethodologyScenario()),
  ];
  const uniqueRecords = Object.values(CHECK_NAME).flatMap((name) =>
    Object.keys(CHECK_VERDICT_BUCKET[name]).map((verdict) => {
      const record = providerRecords.find((candidate) => candidate.name === name && candidate.verdict === verdict);
      if (record === undefined) throw new Error(`no generated diagnose record for ${name}/${verdict}`);
      return record;
    })
  );
  const firstCheck = uniqueRecords[0];
  const omitCheckField = (field: (typeof CHECK_RECORD_FIELDS)[number]): Record<string, unknown> =>
    Object.fromEntries(Object.entries(firstCheck).filter(([name]) => name !== field));
  const substituteFirstCheck = (check: unknown): string =>
    JSON.stringify({ ...report, [checksField]: [check, ...report.checks.slice(1)] });
  const inconsistentOverallCases = Object.values(OVERALL_VERDICT).flatMap((actualOverall) => {
    const representative = uniqueRecords.find((record) => record.bucket === actualOverall);
    if (representative === undefined) throw new Error(`no generated diagnose record for overall ${actualOverall}`);
    const coherentReport = reportForCheck(representative);
    return Object.values(OVERALL_VERDICT)
      .filter((foreignOverall) => foreignOverall !== actualOverall)
      .map((foreignOverall) => ({
        name: `${actualOverall} report rejects overall ${foreignOverall}`,
        input: JSON.stringify({ ...coherentReport, [overallField]: foreignOverall }),
      }));
  });
  const structuralCases: InvalidDiagnoseReportCase[] = [
    { name: "malformed JSON", input: "{" },
    { name: "non-object report", input: JSON.stringify([]) },
    { name: "null report", input: JSON.stringify(null) },
    { name: "missing checks field", input: JSON.stringify({ [overallField]: report.overall }) },
    { name: "missing overall field", input: JSON.stringify({ [checksField]: report.checks }) },
    { name: "null checks", input: JSON.stringify({ ...report, [checksField]: null }) },
    { name: "null overall", input: JSON.stringify({ ...report, [overallField]: null }) },
    { name: "non-array checks", input: JSON.stringify({ ...report, [checksField]: {} }) },
    { name: "null check", input: substituteFirstCheck(null) },
    { name: "non-object check", input: substituteFirstCheck([]) },
    { name: "invalid overall verdict", input: JSON.stringify({ ...report, [overallField]: "invalid" }) },
    { name: "non-string overall verdict", input: JSON.stringify({ ...report, [overallField]: 1 }) },
    { name: "non-string check name", input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[0]]: 1 }) },
    { name: "invalid check name", input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[0]]: "invalid" }) },
    {
      name: "invalid check verdict",
      input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[1]]: "invalid" }),
    },
    { name: "non-string check verdict", input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[1]]: 1 }) },
    { name: "non-string check bucket", input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[2]]: 1 }) },
    {
      name: "invalid check bucket",
      input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[2]]: "invalid" }),
    },
    { name: "non-object readings", input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[3]]: [] }) },
    {
      name: "non-string reading",
      input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[3]]: { invalid: 1 } }),
    },
    { name: "non-string remediation", input: substituteFirstCheck({ ...firstCheck, [CHECK_RECORD_FIELDS[4]]: 1 }) },
    ...CHECK_RECORD_FIELDS.map((field) => ({
      name: `null ${field} field`,
      input: substituteFirstCheck({ ...firstCheck, [field]: null }),
    })),
    ...CHECK_RECORD_FIELDS.map((field) => ({
      name: `missing ${field} field`,
      input: substituteFirstCheck(omitCheckField(field)),
    })),
  ];
  const coherenceCases = uniqueRecords.flatMap((record) => {
    const targetEntry = Object.entries(CHECK_VERDICT_BUCKET).find(([name]) => name === record.name);
    if (targetEntry === undefined) throw new Error(`no verdict registry for ${record.name}`);
    const foreignVerdicts = Object.entries(CHECK_VERDICT_BUCKET)
      .filter(([name]) => name !== record.name)
      .flatMap(([, verdicts]) => Object.keys(verdicts))
      .filter((verdict) => !(verdict in targetEntry[1]));
    const wrongBuckets = Object.values(VERDICT_BUCKET).filter((bucket) => bucket !== record.bucket);
    return [
      ...foreignVerdicts.map((verdict) => ({
        name: `${record.name} rejects foreign verdict ${verdict}`,
        input: substituteFirstCheck({ ...record, [CHECK_RECORD_FIELDS[1]]: verdict }),
      })),
      ...wrongBuckets.map((bucket) => ({
        name: `${record.name}/${record.verdict} rejects bucket ${bucket}`,
        input: substituteFirstCheck({ ...record, [CHECK_RECORD_FIELDS[2]]: bucket }),
      })),
    ];
  });
  return [...structuralCases, ...inconsistentOverallCases, ...coherenceCases];
}

function reportForCheck(check: CheckRecord): DiagnoseReport {
  return { checks: [check], overall: foldOverallVerdict([check.bucket]) };
}

export function styledBucketCases(): readonly StyledBucketCase[] {
  const versions = orderedVersions();
  const representativeByBucket = {
    [VERDICT_BUCKET.HEALTHY]: classifySpxReachability(reusableSpxReading(), undefined),
    [VERDICT_BUCKET.DEGRADED]: classifySpxReachability(reusableSpxReading(), versions.higher),
    [VERDICT_BUCKET.UNKNOWN]: classifySpxReachability(
      { ...reusableSpxReading(), errored: true },
      versions.lower,
    ),
    [VERDICT_BUCKET.BROKEN]: classifySpxReachability(
      { ...reusableSpxReading(), resolvedPath: null },
      versions.lower,
    ),
    [VERDICT_BUCKET.NOT_APPLICABLE]: classifyMarketplaceInstall({
      configured: false,
      errored: false,
      surfacePresent: false,
      unregistered: false,
      drifted: false,
    }),
  } satisfies Record<VerdictBucket, CheckRecord>;
  const expectedSeverity = {
    [VERDICT_BUCKET.HEALTHY]: SEVERITY.OK,
    [VERDICT_BUCKET.DEGRADED]: SEVERITY.WARN,
    [VERDICT_BUCKET.UNKNOWN]: SEVERITY.UNKNOWN,
    [VERDICT_BUCKET.BROKEN]: SEVERITY.ERROR,
    [VERDICT_BUCKET.NOT_APPLICABLE]: SEVERITY.MUTED,
  } satisfies Record<VerdictBucket, Severity>;
  return Object.values(VERDICT_BUCKET).map((bucket) => ({
    bucket,
    expectedSeverity: expectedSeverity[bucket],
    report: reportForCheck(representativeByBucket[bucket]),
  }));
}

export function styledOverallCases(): readonly StyledOverallCase[] {
  const expectedSeverity = {
    [OVERALL_VERDICT.HEALTHY]: SEVERITY.OK,
    [OVERALL_VERDICT.DEGRADED]: SEVERITY.WARN,
    [OVERALL_VERDICT.UNKNOWN]: SEVERITY.UNKNOWN,
    [OVERALL_VERDICT.BROKEN]: SEVERITY.ERROR,
  } satisfies Record<OverallVerdict, Severity>;
  return Object.values(OVERALL_VERDICT).map((overall) => ({
    overall,
    expectedSeverity: expectedSeverity[overall],
    report: { checks: [], overall },
  }));
}

export function diagnoseExitCodeCases(): readonly DiagnoseExitCodeCase[] {
  const expectedCode = {
    [OVERALL_VERDICT.HEALTHY]: 0,
    [OVERALL_VERDICT.DEGRADED]: 1,
    [OVERALL_VERDICT.UNKNOWN]: 2,
    [OVERALL_VERDICT.BROKEN]: 3,
  } satisfies Record<OverallVerdict, number>;
  return Object.values(OVERALL_VERDICT).map((overall) => ({ overall, expectedCode: expectedCode[overall] }));
}

export const INVALID_DIAGNOSE_REPORT_CASES = invalidDiagnoseReportCases();
export const STYLED_BUCKET_CASES = styledBucketCases();
export const STYLED_OVERALL_CASES = styledOverallCases();
export const DIAGNOSE_EXIT_CODE_CASES = diagnoseExitCodeCases();
