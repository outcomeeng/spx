import { describe, expect, it } from "vitest";

import {
  METHODOLOGY_CONTEXT_READING_VALUE,
  METHODOLOGY_CONTEXT_VERDICT,
} from "@/domains/diagnose/checks/methodology-context";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { OVERALL_VERDICT, VERDICT_BUCKET } from "@/domains/diagnose/types";
import { METHODOLOGY_CODING_AGENT, METHODOLOGY_CODING_AGENTS } from "@/lib/methodology/coding-agent";
import { PROVIDER_MATCH } from "@/lib/methodology/provider-match";
import { arbitraryMethodologyLine } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import {
  firstCheck,
  generatedMethodology,
  generatedMigratingMethodology,
  lineOf,
  partiallyShippedObservation,
  runMethodologyDiagnoseJson,
  runMethodologyManifestJson,
  runMethodologyRunnerWithoutFacts,
  shippedObservation,
  unresolvedMethodology,
  unshippedObservation,
} from "@testing/harnesses/diagnose/methodology-context";

describe("methodology-context diagnose scenarios", () => {
  it("reports a declared version whose line ships a tree for every enabled coding agent as healthy", async () => {
    const methodology = generatedMethodology();
    const observation = shippedObservation(methodology);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
    expect(check.bucket).toBe(VERDICT_BUCKET.HEALTHY);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredSource: methodology.source,
      configuredVersion: methodology.version,
      line: lineOf(methodology),
      shippedCodingAgents: [...METHODOLOGY_CODING_AGENTS].join(", "),
      providerMatch: PROVIDER_MATCH.UNDECLARED,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
  });

  it("reports the open migration window alongside the target version", async () => {
    const methodology = generatedMigratingMethodology();
    const observation = shippedObservation(methodology);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredVersion: methodology.version,
      migratingFrom: methodology.migratingFrom,
    }));
  });

  it("reports an unavailable verdict naming the missing tree and the shipped lines when spx ships no tree for the declared line", async () => {
    const methodology = generatedMethodology();
    const shippedLine = sampleGeneratedValue(arbitraryMethodologyLine().filter((line) => line !== lineOf(methodology)));
    const observation = unshippedObservation(methodology, [shippedLine]);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
    expect(check.bucket).toBe(VERDICT_BUCKET.DEGRADED);
    expect(check.readings).toEqual(expect.objectContaining({
      line: lineOf(methodology),
      shippedLines: shippedLine,
      shippedCodingAgents: METHODOLOGY_CONTEXT_READING_VALUE.NONE,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.DEGRADED);
  });

  it("reports an unavailable verdict naming the shipped coding agents when the declared line ships a tree for only some enabled agents", async () => {
    const methodology = generatedMethodology();
    const observation = partiallyShippedObservation(methodology, [METHODOLOGY_CODING_AGENT.CLAUDE]);

    const report = await runMethodologyDiagnoseJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
    expect(check.bucket).toBe(VERDICT_BUCKET.DEGRADED);
    expect(check.readings).toEqual(expect.objectContaining({
      line: lineOf(methodology),
      shippedLines: lineOf(methodology),
      shippedCodingAgents: METHODOLOGY_CODING_AGENT.CLAUDE,
      enabledCodingAgents: [...METHODOLOGY_CODING_AGENTS].join(", "),
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.DEGRADED);
  });

  it("reports manifest methodology facts against the shipped trees", async () => {
    const methodology = generatedMethodology();
    const observation = shippedObservation(methodology);

    const report = await runMethodologyManifestJson(methodology, observation);
    const check = firstCheck(report);

    expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
    expect(check.readings).toEqual(expect.objectContaining({
      configuredSource: methodology.source,
      configuredVersion: methodology.version,
    }));
    expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
  });

  it("reports methodology observation errors as unknown", async () => {
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
});
