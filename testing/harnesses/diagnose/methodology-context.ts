import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import { diagnoseCommand } from "@/commands/diagnose";
import { createMethodologyContextProbe } from "@/commands/diagnose/probes";
import {
  DEFAULT_METHODOLOGY_VERSION,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
} from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { AGENT_HOME_ENV } from "@/domains/agent";
import {
  METHODOLOGY_CONTEXT_VERDICT,
  type MethodologyContextObservation,
  type MethodologyContextProbe,
  methodologyContextRunner,
} from "@/domains/diagnose/checks/methodology-context";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT, DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { OVERALL_VERDICT } from "@/domains/diagnose/types";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const OBSERVED_VERSION = "0.74.2";
const DIFFERENT_VERSION = "0.74.1";
const HIGHER_VERSION = "0.74.10";
const NON_VERSION_DIRECTORY = "999x";
const EXACT_NON_VERSION_DIRECTORY = "stable";
const PLUGIN_CACHE_PATH = ["plugins", "cache"] as const;
const BROKEN_PLUGIN_CACHE_SEGMENT = "plugins";
const BROKEN_PLUGIN_CACHE_FILE_CONTENT = "not a directory";

async function withAgentHomeEnv(
  codexHome: string,
  claudeHome: string,
  callback: () => Promise<void>,
): Promise<void> {
  const previousCodexHome = process.env[AGENT_HOME_ENV.CODEX];
  const previousClaudeHome = process.env[AGENT_HOME_ENV.CLAUDE];
  process.env[AGENT_HOME_ENV.CODEX] = codexHome;
  process.env[AGENT_HOME_ENV.CLAUDE] = claudeHome;
  try {
    await callback();
  } finally {
    if (previousCodexHome === undefined) {
      delete process.env[AGENT_HOME_ENV.CODEX];
    } else {
      process.env[AGENT_HOME_ENV.CODEX] = previousCodexHome;
    }
    if (previousClaudeHome === undefined) {
      delete process.env[AGENT_HOME_ENV.CLAUDE];
    } else {
      process.env[AGENT_HOME_ENV.CLAUDE] = previousClaudeHome;
    }
  }
}

export function generatedMethodology(version = DEFAULT_METHODOLOGY_VERSION): MethodologyConfig {
  return {
    source: [
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
      sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    ].join("/"),
    version,
  };
}

/** An observation of the configured source at a concrete installed version, parameterized by tracked-tree presence. */
export function observedMethodology(
  methodology: MethodologyConfig,
  trackedSpecTree: boolean,
): MethodologyContextObservation {
  return { source: methodology.source, version: OBSERVED_VERSION, trackedSpecTree, errored: false };
}

/**
 * Materializes a temp product directory with or without the tracked spec-tree root and
 * hands its path to the callback. Owns the temp-directory lifecycle only.
 */
export async function withProductDir(
  trackedSpecTree: boolean,
  callback: (productDir: string) => Promise<void>,
): Promise<void> {
  await withTempDir("spx-methodology-product-", async (productDir) => {
    if (trackedSpecTree) {
      await mkdir(join(productDir, SPEC_TREE_CONFIG.ROOT_DIRECTORY), { recursive: true });
    }
    await callback(productDir);
  });
}

/**
 * A probe over the supplied agent home directories for the cache-resolution assertions. Those
 * judge observed-version selection only, so the first agent home — a temp directory carrying no
 * tracked spec tree — serves as the product directory.
 */
function probeOverAgentHomes(...agentHomeDirs: readonly string[]): MethodologyContextProbe {
  return createMethodologyContextProbe(agentHomeDirs[0], ...agentHomeDirs);
}

function registryFor(observation: MethodologyContextObservation): CheckRegistry {
  return {
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
      probe: () => Promise.resolve(observation),
    }),
  };
}

/**
 * Runs `spx diagnose --format json` over a temp product directory carrying the supplied
 * methodology config and the supplied injected observation, returning the parsed report.
 * Owns the temp-environment lifecycle only; the calling assertion file owns every verdict.
 */
export async function runMethodologyDiagnoseJson(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<Record<string, unknown>> {
  return runJson(methodology, observation);
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

async function runManifestWithoutMethodology(): Promise<string> {
  let error: string | undefined;
  await withTestEnv({}, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      manifestPath: "diagnose.json",
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor({ source: null, version: null, trackedSpecTree: false, errored: false }),
      fs: {
        readFile: () => Promise.resolve(JSON.stringify({ checks: [CHECK_NAME.METHODOLOGY_CONTEXT] })),
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      error = result.error;
    }
  });
  if (error === undefined) throw new Error("diagnose command produced no error");
  return error;
}

async function runManifestJsonWithMethodology(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<Record<string, unknown>> {
  let output: string | undefined;
  await withTestEnv({}, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      manifestPath: "diagnose.json",
      format: DIAGNOSE_FORMAT.JSON,
      color: false,
      registry: registryFor(observation),
      fs: {
        readFile: () =>
          Promise.resolve(JSON.stringify({
            checks: [CHECK_NAME.METHODOLOGY_CONTEXT],
            [METHODOLOGY_SECTION]: {
              [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
              [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
            },
          })),
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return JSON.parse(output) as Record<string, unknown>;
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

function expectReadings(
  check: Record<string, unknown>,
  configured: MethodologyConfig,
  observed: MethodologyContextObservation,
): void {
  expect(check.readings).toEqual(expect.objectContaining({
    configuredSource: configured.source,
    configuredVersion: configured.version,
    observedSource: observed.source ?? "(absent)",
    observedVersion: observed.version ?? "(absent)",
  }));
}

export async function assertInstalledMethodologyDiagnoseIsHealthy(): Promise<void> {
  const methodology = generatedMethodology();
  const observation = observedMethodology(methodology, false);
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
}

export async function assertManifestMethodologyDiagnoseIsHealthy(): Promise<void> {
  const methodology = generatedMethodology();
  const observation = observedMethodology(methodology, false);
  const report = await runManifestJsonWithMethodology(methodology, observation);
  const check = firstCheck(report);
  expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
}

export async function assertExactMethodologyVersionMismatchDiagnose(): Promise<void> {
  const methodology = generatedMethodology(DIFFERENT_VERSION);
  const observation = observedMethodology(methodology, false);
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.DEGRADED);
}

export async function assertUnavailableMethodologyDiagnose(): Promise<void> {
  const methodology = generatedMethodology();
  const observation = { source: null, version: null, trackedSpecTree: false, errored: false };
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
}

export async function assertUnknownMethodologyDiagnose(): Promise<void> {
  const methodology = generatedMethodology();
  const observation = { source: null, version: null, trackedSpecTree: false, errored: true };
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
}

export async function assertMethodologyRunnerHandlesMissingMethodologyFact(): Promise<void> {
  const result = await runDiagnose({
    checks: [CHECK_NAME.METHODOLOGY_CONTEXT],
  }, {
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
      probe: () => {
        throw new Error("missing methodology facts must not call the methodology probe");
      },
    }),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  const check = firstCheck(result.value as unknown as Record<string, unknown>);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
  expect(check.readings).toEqual(expect.objectContaining({
    configured: String(false),
  }));
  expect(result.value.overall).toBe(OVERALL_VERDICT.UNKNOWN);
}

export async function assertMethodologyProbeReadErrorsReachUnknownDiagnose(): Promise<void> {
  const methodology = generatedMethodology();
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await writeFile(join(codexHome, BROKEN_PLUGIN_CACHE_SEGMENT), BROKEN_PLUGIN_CACHE_FILE_CONTENT);
    const observation = await probeOverAgentHomes(codexHome).probe(methodology);
    const report = await runJson(methodology, observation);
    const check = firstCheck(report);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
    expectReadings(check, methodology, observation);
    expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
  });
}

export async function assertMethodologyProbePreservesMixedCacheReadErrors(): Promise<void> {
  const methodology = generatedMethodology(DIFFERENT_VERSION);
  await withTempDir("spx-methodology-probe-codex-", async (codexHome) => {
    await withTempDir("spx-methodology-probe-claude-", async (claudeHome) => {
      await writeFile(join(codexHome, BROKEN_PLUGIN_CACHE_SEGMENT), BROKEN_PLUGIN_CACHE_FILE_CONTENT);
      await mkdir(join(claudeHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
        recursive: true,
      });
      const observation = await probeOverAgentHomes(codexHome, claudeHome).probe(methodology);
      const report = await runJson(methodology, observation);
      const check = firstCheck(report);
      expect(observation.version).toBe(HIGHER_VERSION);
      expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
      expectReadings(check, methodology, observation);
      expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
    });
  });
}

export async function assertMethodologyDiagnoseTextRenders(): Promise<void> {
  const methodology = generatedMethodology();
  const output = await runText(methodology, observedMethodology(methodology, false));
  expect(output).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED);
  expect(output).toContain(methodology.source);
  expect(output).toContain(OBSERVED_VERSION);
}

export async function assertMethodologyManifestWithoutFactsRejects(): Promise<void> {
  const error = await runManifestWithoutMethodology();
  expect(error).toContain(CHECK_NAME.METHODOLOGY_CONTEXT);
  expect(error).toContain(METHODOLOGY_SECTION);
}

export async function assertMethodologyDiagnoseRejectsHarnessMethodologyConfig(): Promise<void> {
  let error: string | undefined;
  await withTestEnv({
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodology(),
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor({ source: null, version: null, trackedSpecTree: false, errored: false }),
      fs: { readFile: () => Promise.resolve("") },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      error = result.error;
    }
  });
  if (error === undefined) throw new Error("diagnose command produced no error");
  expect(error).toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
}

export async function assertMethodologyDiagnoseIgnoresUnrelatedHarnessConfigDefects(): Promise<void> {
  const methodology = generatedMethodology();
  const observation = observedMethodology(methodology, false);
  await withTestEnv({
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
    },
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      unrelated: generatedMethodology(),
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
    const report = JSON.parse(result.value.output) as Record<string, unknown>;
    expect(firstCheck(report).verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  });
}

export async function assertMethodologyDiagnoseRejectsUnavailableChecksBeforeHarnessMethodologyConfig(): Promise<void> {
  const unavailableCheck = sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
  let error: string | undefined;
  await withTestEnv({
    [DIAGNOSE_SECTION]: {
      [DIAGNOSE_CONFIG_FIELDS.CHECKS]: [CHECK_NAME.METHODOLOGY_CONTEXT, unavailableCheck],
    },
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodology(),
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor({ source: null, version: null, trackedSpecTree: false, errored: false }),
      fs: { readFile: () => Promise.resolve("") },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      error = result.error;
    }
  });
  if (error === undefined) throw new Error("diagnose command produced no error");
  expect(error).toContain("diagnose config `checks` names checks not available in this build");
  expect(error).toContain(unavailableCheck);
  expect(error).not.toContain(`${LEGACY_METHODOLOGY_CONFIG_SECTION}.${METHODOLOGY_SECTION}`);
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
    const observed = await probeOverAgentHomes(codexHome).probe(methodology);
    expect(observed.version).toBe(HIGHER_VERSION);
  });
}

export async function assertMethodologyProbeIgnoresNonVersionDirectories(): Promise<void> {
  const methodology = generatedMethodology();
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
      recursive: true,
    });
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), NON_VERSION_DIRECTORY), {
      recursive: true,
    });
    const observed = await probeOverAgentHomes(codexHome).probe(methodology);
    expect(observed.version).toBe(HIGHER_VERSION);
  });
}

export async function assertMethodologyProbePrefersConfiguredExactVersion(): Promise<void> {
  const methodology = generatedMethodology(DIFFERENT_VERSION);
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), DIFFERENT_VERSION), {
      recursive: true,
    });
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
      recursive: true,
    });
    const observed = await probeOverAgentHomes(codexHome).probe(methodology);
    expect(observed.version).toBe(DIFFERENT_VERSION);
  });
}

export async function assertMethodologyProbeReportsInstalledVersionForMissingExactVersion(): Promise<void> {
  const methodology = generatedMethodology(DIFFERENT_VERSION);
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
      recursive: true,
    });
    const observed = await probeOverAgentHomes(codexHome).probe(methodology);
    expect(observed.version).toBe(HIGHER_VERSION);
  });
}

export async function assertMethodologyProbeUsesExactNonVersionDirectory(): Promise<void> {
  const methodology = generatedMethodology(EXACT_NON_VERSION_DIRECTORY);
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), EXACT_NON_VERSION_DIRECTORY), {
      recursive: true,
    });
    await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
      recursive: true,
    });
    const observed = await probeOverAgentHomes(codexHome).probe(methodology);
    expect(observed.version).toBe(EXACT_NON_VERSION_DIRECTORY);
  });
}

export async function assertMethodologyProbeReadsSupportedAgentCaches(): Promise<void> {
  const methodology = generatedMethodology();
  await withTempDir("spx-methodology-probe-codex-", async (codexHome) => {
    await withTempDir("spx-methodology-probe-claude-", async (claudeHome) => {
      await mkdir(join(claudeHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
        recursive: true,
      });
      const observed = await probeOverAgentHomes(codexHome, claudeHome).probe(methodology);
      expect(observed.version).toBe(HIGHER_VERSION);
    });
  });
}

export async function assertDefaultMethodologyProbeReadsAgentHomesAtProbeTime(): Promise<void> {
  const methodology = generatedMethodology();
  await withTempDir("spx-methodology-default-codex-", async (codexHome) => {
    await withTempDir("spx-methodology-default-claude-", async (claudeHome) => {
      await mkdir(join(codexHome, ...PLUGIN_CACHE_PATH, ...methodology.source.split("/"), HIGHER_VERSION), {
        recursive: true,
      });
      await withAgentHomeEnv(codexHome, claudeHome, async () => {
        const observed = await probeOverAgentHomes(codexHome).probe(methodology);
        expect(observed.version).toBe(HIGHER_VERSION);
      });
    });
  });
}
