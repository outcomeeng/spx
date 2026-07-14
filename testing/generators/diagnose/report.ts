/**
 * Generators for diagnose report inputs — per-check records and coherent folded
 * reports. Source-owned check names and buckets come from the production
 * modules; the verdict, readings, and remediation are drawn from whitespace-free
 * token domains so the rendered forms stay line-parseable in parity tests.
 *
 * @module testing/generators/diagnose/report
 */

import fc from "fast-check";
import { z } from "zod";

import {
  classifyMarketplaceInstall,
  type MarketplaceInstallReading,
} from "@/domains/diagnose/checks/marketplace-install";
import {
  classifyMethodologyContext,
  type MethodologyContextReading,
} from "@/domains/diagnose/checks/methodology-context";
import {
  classifySessionEnvironment,
  type SessionEnvironmentReading,
} from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore, type SessionStoreReading } from "@/domains/diagnose/checks/session-store";
import { classifySpxReachability, type SpxReachabilityReading } from "@/domains/diagnose/checks/spx-reachability";
import { classifyWorktreePool, type WorktreePoolReading } from "@/domains/diagnose/checks/worktree-pool";
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { CHECK_NAME, type CheckName, type DiagnoseManifest } from "@/domains/diagnose/manifest";
import {
  type CheckRecord,
  type DiagnoseReport,
  OVERALL_VERDICT,
  type OverallVerdict,
  VERDICT_BUCKET,
  type VerdictBucket,
} from "@/domains/diagnose/types";

import { arbitraryMethodologySource, arbitraryNameToken, arbitrarySpxFloor } from "./manifest";

const checkNameSchema = z.enum(Object.values(CHECK_NAME) as [CheckName, ...CheckName[]]);
const verdictBucketSchema = z.enum(Object.values(VERDICT_BUCKET) as [VerdictBucket, ...VerdictBucket[]]);
const overallVerdictSchema = z.enum(Object.values(OVERALL_VERDICT) as [OverallVerdict, ...OverallVerdict[]]);

export interface CompleteDiagnoseRunScenario {
  readonly manifest: DiagnoseManifest;
  readonly spxReachability: SpxReachabilityReading;
  readonly sessionEnvironment: SessionEnvironmentReading;
  readonly worktreePool: WorktreePoolReading;
  readonly sessionStore: SessionStoreReading;
  readonly marketplaceInstall: MarketplaceInstallReading;
  readonly methodologyContext: MethodologyContextReading;
}

/** Strict test-side schema for the rendered diagnose JSON contract. */
export const diagnoseReportOracleSchema = z.object({
  checks: z.array(
    z.object({
      name: checkNameSchema,
      verdict: z.string(),
      bucket: verdictBucketSchema,
      readings: z.record(z.string(), z.string()),
      remediation: z.string(),
    }).strict(),
  ),
  overall: overallVerdictSchema,
}).strict();

const arbitrarySpxReading = (): fc.Arbitrary<SpxReachabilityReading> =>
  fc.record({
    errored: fc.boolean(),
    resolvedPath: fc.option(arbitraryNameToken(), { nil: null }),
    version: fc.option(arbitrarySpxFloor(), { nil: null }),
  });

const arbitrarySpxRecord = (): fc.Arbitrary<CheckRecord> =>
  fc.tuple(
    arbitrarySpxReading(),
    fc.option(arbitrarySpxFloor(), { nil: undefined }),
  ).map(([reading, floor]) => classifySpxReachability(reading, floor));

const arbitrarySessionEnvironmentReading = (): fc.Arbitrary<SessionEnvironmentReading> =>
  fc.record({
    errored: fc.boolean(),
    hookPresent: fc.boolean(),
    sessionIdentity: fc.boolean(),
    worktreeClaimed: fc.boolean(),
  });

const arbitrarySessionEnvironmentRecord = (): fc.Arbitrary<CheckRecord> =>
  arbitrarySessionEnvironmentReading().map(classifySessionEnvironment);

const arbitraryWorktreePoolReading = (): fc.Arbitrary<WorktreePoolReading> =>
  fc.record({
    errored: fc.boolean(),
    bareRepository: fc.boolean(),
    linkedWorktrees: fc.boolean(),
    mainCheckoutPath: fc.option(arbitraryNameToken(), { nil: null }),
    defaultBranch: fc.option(arbitraryNameToken(), { nil: null }),
    mainCheckoutBranch: fc.option(arbitraryNameToken(), { nil: null }),
    mainCheckoutBranchRead: fc.boolean(),
    running: fc.nat(),
    free: fc.nat(),
  });

const arbitraryWorktreePoolRecord = (): fc.Arbitrary<CheckRecord> =>
  arbitraryWorktreePoolReading().map(classifyWorktreePool);

const arbitrarySessionStoreReading = (): fc.Arbitrary<SessionStoreReading> =>
  fc.record({
    errored: fc.boolean(),
    orphanedClaims: fc.nat(),
  });

const arbitrarySessionStoreRecord = (): fc.Arbitrary<CheckRecord> =>
  arbitrarySessionStoreReading().map(classifySessionStore);

const arbitraryMarketplaceInstallReading = (): fc.Arbitrary<MarketplaceInstallReading> =>
  fc.record({
    configured: fc.boolean(),
    errored: fc.boolean(),
    surfacePresent: fc.boolean(),
    unregistered: fc.boolean(),
    drifted: fc.boolean(),
  });

const arbitraryMarketplaceInstallRecord = (): fc.Arbitrary<CheckRecord> =>
  arbitraryMarketplaceInstallReading().map(classifyMarketplaceInstall);

const arbitraryMethodologyContextReading = (): fc.Arbitrary<MethodologyContextReading> =>
  fc.record({
    configured: fc.boolean(),
    configuredSource: fc.option(arbitraryMethodologySource(), { nil: null }),
    configuredVersion: fc.option(arbitrarySpxFloor(), { nil: null }),
    observedSource: fc.option(arbitraryMethodologySource(), { nil: null }),
    observedVersion: fc.option(arbitrarySpxFloor(), { nil: null }),
    errored: fc.boolean(),
  });

const arbitraryMethodologyContextRecord = (): fc.Arbitrary<CheckRecord> =>
  arbitraryMethodologyContextReading().map(classifyMethodologyContext);

/** A coherent provider-owned record built through the provider classifier. */
export const arbitraryCheckRecord = (): fc.Arbitrary<CheckRecord> =>
  fc.oneof(
    arbitrarySpxRecord(),
    arbitrarySessionEnvironmentRecord(),
    arbitraryWorktreePoolRecord(),
    arbitrarySessionStoreRecord(),
    arbitraryMarketplaceInstallRecord(),
    arbitraryMethodologyContextRecord(),
  );

/** Raw readings for every source-owned diagnose provider and their shared manifest. */
export const arbitraryCompleteDiagnoseRunScenario = (): fc.Arbitrary<CompleteDiagnoseRunScenario> =>
  fc.tuple(
    arbitrarySpxReading(),
    arbitrarySessionEnvironmentReading(),
    arbitraryWorktreePoolReading(),
    arbitrarySessionStoreReading(),
    arbitraryMarketplaceInstallReading(),
    arbitraryMethodologyContextReading(),
    fc.option(arbitrarySpxFloor(), { nil: undefined }),
  ).map(([
    spxReachability,
    sessionEnvironment,
    worktreePool,
    sessionStore,
    marketplaceInstall,
    methodologyContext,
    spxFloor,
  ]) => ({
    manifest: { checks: Object.values(CHECK_NAME), spxFloor },
    spxReachability,
    sessionEnvironment,
    worktreePool,
    sessionStore,
    marketplaceInstall,
    methodologyContext,
  }));

/** Variable bucket sequences for fold determinism properties. */
export const arbitraryVerdictBuckets = (): fc.Arbitrary<readonly VerdictBucket[]> =>
  fc.array(fc.constantFrom(...Object.values(VERDICT_BUCKET)));

/** A coherent report whose overall verdict is the fold of its check buckets. */
export const arbitraryReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc.array(arbitraryCheckRecord(), { maxLength: 6 }).map((checks) => ({
    checks,
    overall: foldOverallVerdict(checks.map((check) => check.bucket)),
  }));

/** JSON input produced without the diagnose report renderer. */
export function independentReportJson(report: DiagnoseReport): string {
  return JSON.stringify(report);
}
