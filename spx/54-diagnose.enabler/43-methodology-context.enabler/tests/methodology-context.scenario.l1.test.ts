import { describe, expect, it } from "vitest";

import { METHODOLOGY_VERSION_INTENT } from "@/config/methodology";
import { METHODOLOGY_CONTEXT_VERDICT } from "@/domains/diagnose/checks/methodology-context";
import { VERDICT_BUCKET } from "@/domains/diagnose/types";
import {
  assertExactMethodologyVersionMismatchDiagnose,
  assertInstalledMethodologyDiagnoseIsHealthy,
  assertManifestMethodologyDiagnoseIsHealthy,
  assertMethodologyProbePreservesMixedCacheReadErrors,
  assertMethodologyProbeReadErrorsReachUnknownDiagnose,
  assertMethodologyRunnerHandlesMissingMethodologyFact,
  assertUnavailableMethodologyDiagnose,
  assertUnknownMethodologyDiagnose,
  generatedMethodology,
  observedMethodology,
  runMethodologyDiagnoseJson,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose scenarios", () => {
  it("reports installed methodology config with an observed version", async () => {
    await assertInstalledMethodologyDiagnoseIsHealthy();
  });

  it("reports bootstrap intent as healthy when no tracked spec tree exists", async () => {
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, false);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const [check] = report.checks as readonly Record<string, unknown>[];

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
    expect(check.bucket).toBe(VERDICT_BUCKET.HEALTHY);
    expect(check.readings).toEqual(expect.objectContaining({
      versionIntent: METHODOLOGY_VERSION_INTENT.BOOTSTRAP,
      observedVersion: observation.version,
    }));
  });

  it("reports degraded methodology identity when a tracked spec tree declares the bootstrap sentinel", async () => {
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, true);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const [check] = report.checks as readonly Record<string, unknown>[];

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.BOOTSTRAP_IDENTITY);
    expect(check.bucket).toBe(VERDICT_BUCKET.DEGRADED);
    expect(check.remediation).toContain(METHODOLOGY_VERSION_INTENT.EXACT);
  });

  it("reports manifest methodology facts with an observed version", async () => {
    await assertManifestMethodologyDiagnoseIsHealthy();
  });

  it("reports exact methodology version mismatch", async () => {
    await assertExactMethodologyVersionMismatchDiagnose();
  });

  it("reports unavailable methodology context", async () => {
    await assertUnavailableMethodologyDiagnose();
  });

  it("reports unknown methodology context", async () => {
    await assertUnknownMethodologyDiagnose();
  });

  it("reports missing methodology facts as unknown", async () => {
    await assertMethodologyRunnerHandlesMissingMethodologyFact();
  });

  it("reports methodology probe read errors as unknown", async () => {
    await assertMethodologyProbeReadErrorsReachUnknownDiagnose();
  });

  it("reports mixed methodology cache read errors as unknown", async () => {
    await assertMethodologyProbePreservesMixedCacheReadErrors();
  });
});
