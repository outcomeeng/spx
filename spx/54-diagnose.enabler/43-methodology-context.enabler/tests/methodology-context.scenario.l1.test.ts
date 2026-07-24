import { describe, expect, it } from "vitest";

import { METHODOLOGY_VERSION_INTENT } from "@/config/methodology";
import {
  METHODOLOGY_CONTEXT_READING_VALUE,
  METHODOLOGY_CONTEXT_VERDICT,
} from "@/domains/diagnose/checks/methodology-context";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import {
  breakMethodologyCache,
  firstCheck,
  generatedMethodology,
  installMethodologyVersion,
  METHODOLOGY_CACHE_VERSION,
  observedMethodology,
  probeOverAgentHomes,
  runMethodologyDiagnoseJson,
  runMethodologyManifestJson,
  runMethodologyRunnerWithoutFacts,
  unresolvedMethodology,
  withAgentHome,
  withAgentHomePair,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose scenarios", () => {
  it("reports installed methodology config with an observed version", async () => {
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, false);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredSource: methodology.source,
      configuredVersion: methodology.version,
      observedSource: observation.source,
      observedVersion: observation.version,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
  });

  it("reports bootstrap intent as healthy when no tracked spec tree exists", async () => {
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, false);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

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
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.BOOTSTRAP_IDENTITY);
    expect(check.bucket).toBe(VERDICT_BUCKET.DEGRADED);
    expect(check.remediation).toContain(METHODOLOGY_VERSION_INTENT.EXACT);
  });

  it("reports manifest methodology facts with an observed version", async () => {
    const methodology = generatedMethodology();
    const observation = observedMethodology(methodology, false);

    const report = await runMethodologyManifestJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredSource: methodology.source,
      configuredVersion: methodology.version,
      observedVersion: observation.version,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
  });

  it("reports exact methodology version mismatch", async () => {
    const methodology = generatedMethodology(METHODOLOGY_CACHE_VERSION.PATCH_1);
    const observation = observedMethodology(methodology, false);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(observation.version).not.toBe(methodology.version);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredVersion: methodology.version,
      observedVersion: observation.version,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.DEGRADED);
  });

  it("reports unavailable methodology context", async () => {
    const methodology = generatedMethodology();
    const observation = unresolvedMethodology(false);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredSource: methodology.source,
      observedSource: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
      observedVersion: METHODOLOGY_CONTEXT_READING_VALUE.ABSENT,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
  });

  it("reports unknown methodology context", async () => {
    const methodology = generatedMethodology();
    const observation = unresolvedMethodology(true);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
    expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
  });

  it("reports missing methodology facts as unknown without reaching the probe", async () => {
    const report = await runMethodologyRunnerWithoutFacts();
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
    expect(check.readings).toEqual(expect.objectContaining({ configured: String(false) }));
    expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
  });

  it("reports methodology probe read errors as unknown", async () => {
    const methodology = generatedMethodology();

    await withAgentHome(async (codexHome) => {
      await breakMethodologyCache(codexHome);
      const observation = await probeOverAgentHomes(methodology, codexHome);

      const report = await runMethodologyDiagnoseJson(methodology, observation);
      const check = firstCheck(report);

      expect(observation.errored).toBe(true);
      expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
      expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
    });
  });

  it("reports mixed methodology cache read errors as unknown while preserving the observed version", async () => {
    const methodology = generatedMethodology(METHODOLOGY_CACHE_VERSION.PATCH_1);

    await withAgentHomePair(async (codexHome, claudeHome) => {
      await breakMethodologyCache(codexHome);
      await installMethodologyVersion(claudeHome, methodology, METHODOLOGY_CACHE_VERSION.PATCH_10);
      const observation = await probeOverAgentHomes(methodology, codexHome, claudeHome);

      const report = await runMethodologyDiagnoseJson(methodology, observation);
      const check = firstCheck(report);

      expect(observation.version).toBe(METHODOLOGY_CACHE_VERSION.PATCH_10);
      expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
      expect(check.readings).toEqual(expect.objectContaining({
        observedVersion: METHODOLOGY_CACHE_VERSION.PATCH_10,
      }));
      expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
    });
  });
});
