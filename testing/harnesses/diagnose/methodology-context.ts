import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import { diagnoseCommand } from "@/commands/diagnose";
import { createMethodologyContextProbe } from "@/commands/diagnose/probes";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION, type MethodologyConfig } from "@/config/methodology";
import {
  METHODOLOGY_CONTEXT_VERDICT,
  type MethodologyContextObservation,
  methodologyContextRunner,
} from "@/domains/diagnose/checks/methodology-context";
import type { CheckRegistry } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT, DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { OVERALL_VERDICT } from "@/domains/diagnose/types";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const OBSERVED_VERSION = "0.74.2";
const DIFFERENT_VERSION = "0.74.1";
const HIGHER_VERSION = "0.74.10";
const PLUGIN_CACHE_PATH = ["plugins", "cache"] as const;

function generatedMethodology(version = "installed"): MethodologyConfig {
  return {
    source: [
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    ].join("/"),
    version,
  };
}

function registryFor(observation: MethodologyContextObservation): CheckRegistry {
  return {
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
      probe: () => Promise.resolve(observation),
    }),
  };
}

async function runJson(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<Record<string, unknown>> {
  let output: string | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      format: DIAGNOSE_FORMAT.JSON,
      color: false,
      registry: registryFor(observation),
      fs: { readFile: () => Promise.resolve("") },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return JSON.parse(output) as Record<string, unknown>;
}

async function runText(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<string> {
  let output: string | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor(observation),
      fs: { readFile: () => Promise.resolve("") },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return output;
}

async function runManifestTextWithoutMethodology(): Promise<string> {
  let output: string | undefined;
  await withTestEnv({}, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      manifestPath: "diagnose.json",
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor({ source: null, version: null, errored: false }),
      fs: {
        readFile: () => Promise.resolve(JSON.stringify({ checks: [CHECK_NAME.METHODOLOGY_CONTEXT] })),
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return output;
}

function firstCheck(report: Record<string, unknown>): Record<string, unknown> {
  const checks = report.checks;
  expect(Array.isArray(checks)).toBe(true);
  if (!Array.isArray(checks)) throw new Error("diagnose report checks are not an array");
  const [check] = checks;
  expect(typeof check).toBe("object");
  if (typeof check !== "object" || check === null) throw new Error("diagnose report has no first check");
  return check as Record<string, unknown>;
}

export async function assertInstalledMethodologyDiagnoseIsHealthy(): Promise<void> {
  const methodology = generatedMethodology();
  const report = await runJson(methodology, {
    source: methodology.source,
    version: OBSERVED_VERSION,
    errored: false,
  });
  const check = firstCheck(report);
  expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
}

export async function assertExactMethodologyVersionMismatchDiagnose(): Promise<void> {
  const methodology = generatedMethodology(DIFFERENT_VERSION);
  const report = await runJson(methodology, {
    source: methodology.source,
    version: OBSERVED_VERSION,
    errored: false,
  });
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH);
  expect(report.overall).toBe(OVERALL_VERDICT.DEGRADED);
}

export async function assertUnavailableMethodologyDiagnose(): Promise<void> {
  const methodology = generatedMethodology();
  const report = await runJson(methodology, {
    source: null,
    version: null,
    errored: false,
  });
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
  expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
}

export async function assertUnknownMethodologyDiagnose(): Promise<void> {
  const methodology = generatedMethodology();
  const report = await runJson(methodology, {
    source: null,
    version: null,
    errored: true,
  });
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
  expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
}

export async function assertMethodologyDiagnoseTextRenders(): Promise<void> {
  const methodology = generatedMethodology();
  const output = await runText(methodology, {
    source: methodology.source,
    version: OBSERVED_VERSION,
    errored: false,
  });
  expect(output).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED);
  expect(output).toContain(OBSERVED_VERSION);
}

export async function assertMethodologyNotApplicableTextRenders(): Promise<void> {
  const output = await runManifestTextWithoutMethodology();
  expect(output).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_NOT_CONFIGURED);
  expect(output).not.toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_CONFIGURED);
}

export async function assertMethodologyProbeUsesNumericVersionOrder(): Promise<void> {
  const methodology = generatedMethodology();
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), OBSERVED_VERSION), {
      recursive: true,
    });
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
      recursive: true,
    });
    const observed = await createMethodologyContextProbe(codexHome).probe(methodology);
    expect(observed.version).toBe(HIGHER_VERSION);
  });
}
