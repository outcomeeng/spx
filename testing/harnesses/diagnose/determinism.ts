import { describe, expect, it } from "vitest";

import { classifyMarketplaceInstall } from "@/domains/diagnose/checks/marketplace-install";
import { classifyMethodologyContext } from "@/domains/diagnose/checks/methodology-context";
import { classifySessionEnvironment } from "@/domains/diagnose/checks/session-environment";
import { classifySessionStore } from "@/domains/diagnose/checks/session-store";
import { classifySpxReachability } from "@/domains/diagnose/checks/spx-reachability";
import { classifyWorktreePool } from "@/domains/diagnose/checks/worktree-pool";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { foldOverallVerdict, overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { OVERALL_VERDICT } from "@/domains/diagnose/types";
import {
  arbitraryCompleteDiagnoseRunScenario,
  arbitraryVerdictBuckets,
  type CompleteDiagnoseRunScenario,
} from "@testing/generators/diagnose/report";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

function registryFromReadings(scenario: CompleteDiagnoseRunScenario): CheckRegistry {
  return {
    [CHECK_NAME.SPX_REACHABILITY]: async (manifest) =>
      classifySpxReachability(scenario.spxReachability, manifest.spxFloor),
    [CHECK_NAME.SESSION_ENVIRONMENT]: async () => classifySessionEnvironment(scenario.sessionEnvironment),
    [CHECK_NAME.WORKTREE_POOL]: async () => classifyWorktreePool(scenario.worktreePool),
    [CHECK_NAME.SESSION_STORE]: async () => classifySessionStore(scenario.sessionStore),
    [CHECK_NAME.MARKETPLACE_INSTALL]: async () => classifyMarketplaceInstall(scenario.marketplaceInstall),
    [CHECK_NAME.METHODOLOGY_CONTEXT]: async () => classifyMethodologyContext(scenario.methodologyContext),
  };
}

export function registerDiagnoseDeterminismProperties(): void {
  describe("the diagnose fold is deterministic over its bucket inputs", () => {
    it("folds an identical bucket set to the same overall verdict on every evaluation", () => {
      assertProperty(
        arbitraryVerdictBuckets(),
        (buckets) => {
          expect(foldOverallVerdict(buckets)).toBe(
            foldOverallVerdict([...buckets]),
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("folds a bucket set independently of the order its buckets are presented in", () => {
      assertProperty(
        arbitraryVerdictBuckets(),
        (buckets) => {
          expect(foldOverallVerdict([...buckets].reverse())).toBe(
            foldOverallVerdict(buckets),
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("yields an exit code that is a total function of the folded overall verdict", () => {
      assertProperty(
        arbitraryVerdictBuckets(),
        (buckets) => {
          const overall = foldOverallVerdict(buckets);
          expect(overallExitCode(overall)).toBe(
            overallExitCode(foldOverallVerdict([...buckets].reverse())),
          );
          expect(Object.values(OVERALL_VERDICT)).toContain(overall);
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });

  describe("complete diagnose runs are deterministic over identical provider readings and manifest", () => {
    it("produces identical per-check and overall verdicts across every registered provider", async () => {
      await assertProperty(
        arbitraryCompleteDiagnoseRunScenario(),
        async (scenario) => {
          const first = await runDiagnose(scenario.manifest, registryFromReadings(scenario));
          const second = await runDiagnose(scenario.manifest, registryFromReadings(scenario));

          expect(first).toEqual(second);
          expect(first.ok).toBe(true);
          if (first.ok) {
            expect(first.value.checks.map((check) => check.name)).toEqual(scenario.manifest.checks);
            expect(first.value.overall).toBe(
              foldOverallVerdict(first.value.checks.map((record) => record.bucket)),
            );
          }
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}
