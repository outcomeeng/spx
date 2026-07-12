/**
 * Generators for diagnose report inputs — per-check records and coherent folded
 * reports. Source-owned check names and buckets come from the production
 * modules; the verdict, readings, and remediation are drawn from whitespace-free
 * token domains so the rendered forms stay line-parseable in parity tests.
 *
 * @module testing/generators/diagnose/report
 */

import fc from "fast-check";

import { classifyMarketplaceInstall } from "@/domains/diagnose/checks/marketplace-install";
import { classifyMethodologyContext } from "@/domains/diagnose/checks/methodology-context";
import { classifySessionEnvironment } from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore } from "@/domains/diagnose/checks/session-store";
import { classifySpxReachability } from "@/domains/diagnose/checks/spx-reachability";
import { foldOverallVerdict } from "@/domains/diagnose/fold";
import { type CheckRecord, type DiagnoseReport } from "@/domains/diagnose/types";

import { arbitraryMethodologySource, arbitraryNameToken, arbitrarySpxFloor } from "./manifest";

/** A coherent provider-owned record built through the provider classifier. */
export const arbitraryCheckRecord = (): fc.Arbitrary<CheckRecord> =>
  fc.oneof(
    fc.record({
      errored: fc.boolean(),
      resolvedPath: fc.option(arbitraryNameToken(), { nil: null }),
      version: fc.option(arbitrarySpxFloor(), { nil: null }),
      floor: fc.option(arbitrarySpxFloor(), { nil: undefined }),
    }).map(({ floor, ...reading }) => classifySpxReachability(reading, floor)),
    fc.record({
      errored: fc.boolean(),
      hookPresent: fc.boolean(),
      sessionIdentity: fc.boolean(),
      worktreeClaimed: fc.boolean(),
    }).map(classifySessionEnvironment),
    fc.record({
      errored: fc.boolean(),
      orphanedClaims: fc.nat(),
    }).map(classifySessionStore),
    fc.record({
      configured: fc.boolean(),
      errored: fc.boolean(),
      surfacePresent: fc.boolean(),
      unregistered: fc.boolean(),
      drifted: fc.boolean(),
    }).map(classifyMarketplaceInstall),
    fc.record({
      configured: fc.boolean(),
      configuredSource: fc.option(arbitraryMethodologySource(), { nil: null }),
      configuredVersion: fc.option(arbitrarySpxFloor(), { nil: null }),
      observedSource: fc.option(arbitraryMethodologySource(), { nil: null }),
      observedVersion: fc.option(arbitrarySpxFloor(), { nil: null }),
      errored: fc.boolean(),
    }).map(classifyMethodologyContext),
  );

/** A coherent report whose overall verdict is the fold of its check buckets. */
export const arbitraryReport = (): fc.Arbitrary<DiagnoseReport> =>
  fc.array(arbitraryCheckRecord(), { maxLength: 6 }).map((checks) => ({
    checks,
    overall: foldOverallVerdict(checks.map((check) => check.bucket)),
  }));
