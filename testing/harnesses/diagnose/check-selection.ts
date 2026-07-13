import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { type CheckRegistry, type CheckRunner, runDiagnose } from "@/domains/diagnose/engine";
import { CHECK_NAME, type CheckName, type DiagnoseManifest } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { arbitraryCheckName } from "@testing/generators/diagnose/manifest";
import { assertProperty, PROPERTY_LEVEL } from "@testing/harnesses/property/property";

/** A registry of recording runners over every known check; each appends its name when invoked. */
function recordingRegistry(invoked: CheckName[]): CheckRegistry {
  const entries = Object.values(CHECK_NAME).map(
    (name): readonly [CheckName, CheckRunner] => [
      name,
      async (): Promise<CheckRecord> => {
        invoked.push(name);
        return {
          name,
          verdict: name,
          bucket: VERDICT_BUCKET.HEALTHY,
          readings: {},
          remediation: name,
        };
      },
    ],
  );
  return Object.fromEntries(entries);
}

export function registerCheckSelectionMappings(): void {
  describe("the pipeline runs exactly the resolved check set, in the order the resolved facts supply it", () => {
    it("invokes each named check once, in order, and only the named checks", async () => {
      await assertProperty(
        fc.uniqueArray(arbitraryCheckName(), { minLength: 1 }),
        async (checks) => {
          const invoked: CheckName[] = [];
          const manifest: DiagnoseManifest = { checks };
          const result = await runDiagnose(
            manifest,
            recordingRegistry(invoked),
          );
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(invoked).toEqual(checks);
          expect(result.value.checks.map((check) => check.name)).toEqual(
            checks,
          );
        },
        { level: PROPERTY_LEVEL.L1 },
      );
    });

    it("reports an error when a named check has no registered runner", async () => {
      const manifest: DiagnoseManifest = {
        checks: [CHECK_NAME.SPX_REACHABILITY],
      };
      const result = await runDiagnose(manifest, {});
      expect(result.ok).toBe(false);
    });
  });
}
