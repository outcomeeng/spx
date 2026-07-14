import { describe, expect, it } from "vitest";

import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { foldOverallVerdict, overallExitCode } from "@/domains/diagnose/fold";
import { CHECK_NAME, type CheckName } from "@/domains/diagnose/manifest";
import { type CheckRecord, OVERALL_VERDICT } from "@/domains/diagnose/types";
import { arbitraryCompleteDiagnoseRunScenario, arbitraryVerdictBuckets } from "@testing/generators/diagnose/report";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

function registryFromRecords(records: readonly CheckRecord[]): CheckRegistry {
  const registry: Partial<Record<CheckName, () => Promise<CheckRecord>>> = {};
  for (const record of records) {
    const name = Object.values(CHECK_NAME).find((candidate) => candidate === record.name);
    if (name === undefined) throw new Error(`generated record names unknown check: ${record.name}`);
    registry[name] = () => Promise.resolve(record);
  }
  return registry;
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
        async ({ checks, records }) => {
          const manifest = { checks };
          const first = await runDiagnose(manifest, registryFromRecords(records));
          const second = await runDiagnose(manifest, registryFromRecords(records));

          expect(first).toEqual(second);
          expect(first.ok).toBe(true);
          if (first.ok) {
            expect(first.value.checks.map((check) => check.name)).toEqual(checks);
            expect(first.value.overall).toBe(
              foldOverallVerdict(records.map((record) => record.bucket)),
            );
          }
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });
  });
}
