import { describe, expect, it } from "vitest";

import { DEFAULT_HARNESS_ENVIRONMENT_CONFIG } from "@/domains/agent-environment/config";
import type { DiagnoseFacts } from "@/domains/diagnose/effective-facts";
import { type CheckRegistry, type CheckRunner, runDiagnose } from "@/domains/diagnose/engine";
import { CHECK_NAME, type CheckName } from "@/domains/diagnose/manifest";
import { type CheckRecord, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { checkSelectionCases, missingRunnerCheck } from "@testing/generators/diagnose/engine";

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
    it.each(checkSelectionCases())("invokes $name exactly in supplied order", async ({ checks }) => {
      const invoked: CheckName[] = [];
      const manifest: DiagnoseFacts = { checks, harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG };
      const result = await runDiagnose(manifest, recordingRegistry(invoked));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(invoked).toEqual(checks);
      expect(result.value.checks.map((check) => check.name)).toEqual(checks);
    });

    it("reports an error when a named check has no registered runner", async () => {
      const manifest: DiagnoseFacts = {
        checks: [missingRunnerCheck()],
        harnessEnvironment: DEFAULT_HARNESS_ENVIRONMENT_CONFIG,
      };
      const result = await runDiagnose(manifest, {});
      expect(result.ok).toBe(false);
    });
  });
}
