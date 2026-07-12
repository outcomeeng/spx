import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect } from "vitest";

import { diagnoseCommand } from "@/commands/diagnose";
import {
  createMethodologyContextProbe,
  defaultMethodologyContextProbe,
  METHODOLOGY_PLUGIN_CACHE_SEGMENTS,
} from "@/commands/diagnose/probes";
import { METHODOLOGY_CONFIG_FIELDS, METHODOLOGY_SECTION, type MethodologyConfig } from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { AGENT_HOME_ENV } from "@/domains/agent";
import {
  METHODOLOGY_CONTEXT_VERDICT,
  type MethodologyContextObservation,
  methodologyContextRunner,
} from "@/domains/diagnose/checks/methodology-context";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_OUTPUT_MODE, DIAGNOSE_TEXT_HEADER } from "@/domains/diagnose/report";
import { OVERALL_VERDICT } from "@/domains/diagnose/types";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import {
  arbitraryMethodologyVersionSelectionScenario,
  cacheReadErrorFileContent,
  mismatchedMethodologyScenario,
  mixedCacheReadErrorScenario,
  resolvedMethodologyScenario,
  type SupportedAgentCacheCase,
  unavailableMethodologyScenario,
  unknownMethodologyScenario,
} from "@testing/generators/diagnose/methodology-context";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

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
      outputMode: DIAGNOSE_OUTPUT_MODE.JSON,
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
      outputMode: DIAGNOSE_OUTPUT_MODE.VERBOSE,
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
      outputMode: DIAGNOSE_OUTPUT_MODE.VERBOSE,
      color: false,
      registry: {
        [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
          probe: () => {
            throw new Error("invalid methodology manifest must reject before probing");
          },
        }),
      },
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
      outputMode: DIAGNOSE_OUTPUT_MODE.JSON,
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
  const { methodology, observation } = resolvedMethodologyScenario();
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
}

export async function assertManifestMethodologyDiagnoseIsHealthy(): Promise<void> {
  const { methodology, observation } = resolvedMethodologyScenario();
  const report = await runManifestJsonWithMethodology(methodology, observation);
  const check = firstCheck(report);
  expect(check.name).toBe(CHECK_NAME.METHODOLOGY_CONTEXT);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.RESOLVED);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.HEALTHY);
}

export async function assertExactMethodologyVersionMismatchDiagnose(): Promise<void> {
  const { methodology, observation } = mismatchedMethodologyScenario();
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.VERSION_MISMATCH);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.DEGRADED);
}

export async function assertUnavailableMethodologyDiagnose(): Promise<void> {
  const { methodology, observation } = unavailableMethodologyScenario();
  const report = await runJson(methodology, observation);
  const check = firstCheck(report);
  expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNAVAILABLE);
  expectReadings(check, methodology, observation);
  expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
}

export async function assertUnknownMethodologyDiagnose(): Promise<void> {
  const { methodology, observation } = unknownMethodologyScenario();
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
  const { methodology } = resolvedMethodologyScenario();
  await withTempDir("spx-methodology-probe-", async (codexHome) => {
    await writeFile(
      join(codexHome, METHODOLOGY_PLUGIN_CACHE_SEGMENTS[0]),
      cacheReadErrorFileContent(),
    );
    const observation = await createMethodologyContextProbe(codexHome).probe(methodology);
    const report = await runJson(methodology, observation);
    const check = firstCheck(report);
    expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
    expectReadings(check, methodology, observation);
    expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
  });
}

export async function assertMethodologyProbePreservesMixedCacheReadErrors(): Promise<void> {
  const { methodology, observation: expectedObservation } = mixedCacheReadErrorScenario();
  await withTempDir("spx-methodology-probe-codex-", async (codexHome) => {
    await withTempDir("spx-methodology-probe-claude-", async (claudeHome) => {
      await writeFile(
        join(codexHome, METHODOLOGY_PLUGIN_CACHE_SEGMENTS[0]),
        cacheReadErrorFileContent(),
      );
      await mkdir(
        join(
          claudeHome,
          ...METHODOLOGY_PLUGIN_CACHE_SEGMENTS,
          ...methodology.source.split("/"),
          expectedObservation.version ?? "",
        ),
        {
          recursive: true,
        },
      );
      const observation = await createMethodologyContextProbe(codexHome, claudeHome).probe(methodology);
      const report = await runJson(methodology, observation);
      const check = firstCheck(report);
      expect(observation.version).toBe(expectedObservation.version);
      expect(check.verdict).toBe(METHODOLOGY_CONTEXT_VERDICT.UNKNOWN);
      expectReadings(check, methodology, observation);
      expect(report.overall).toBe(OVERALL_VERDICT.UNKNOWN);
    });
  });
}

export async function assertMethodologyDiagnoseTextRenders(): Promise<void> {
  const { methodology, observation } = resolvedMethodologyScenario();
  const output = await runText(methodology, observation);
  expect(output).toContain(DIAGNOSE_TEXT_HEADER.METHODOLOGY_RESOLVED);
  expect(output).toContain(methodology.source);
  expect(output).toContain(observation.version);
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
      [METHODOLOGY_SECTION]: resolvedMethodologyScenario().methodology,
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.VERBOSE,
      color: false,
      registry: registryFor({ source: null, version: null, errored: false }),
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
  const { methodology, observation } = resolvedMethodologyScenario();
  await withTestEnv({
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
    },
    [LEGACY_METHODOLOGY_CONFIG_SECTION]: {
      unrelated: resolvedMethodologyScenario().methodology,
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.JSON,
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
      [METHODOLOGY_SECTION]: resolvedMethodologyScenario().methodology,
    },
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      outputMode: DIAGNOSE_OUTPUT_MODE.VERBOSE,
      color: false,
      registry: registryFor({ source: null, version: null, errored: false }),
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

export async function assertMethodologyVersionSelectionProperty(): Promise<void> {
  await assertProperty(
    arbitraryMethodologyVersionSelectionScenario(),
    async (scenario) => {
      await withTempDir("spx-methodology-version-selection-", async (codexHome) => {
        for (const version of scenario.versionDirectories) {
          await mkdir(
            join(
              codexHome,
              ...METHODOLOGY_PLUGIN_CACHE_SEGMENTS,
              ...scenario.methodology.source.split("/"),
              version,
            ),
            { recursive: true },
          );
        }
        const observed = await createMethodologyContextProbe(codexHome).probe(scenario.methodology);
        expect(observed.version).toBe(scenario.expectedVersion);
      });
    },
    { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
  );
}

export async function assertSupportedAgentCacheCase(testCase: SupportedAgentCacheCase): Promise<void> {
  const { methodology, observation } = resolvedMethodologyScenario();
  await withTempDir("spx-methodology-probe-codex-", async (codexHome) => {
    await withTempDir("spx-methodology-probe-claude-", async (claudeHome) => {
      const selectedHome = testCase.agentHomeEnv === AGENT_HOME_ENV.CODEX ? codexHome : claudeHome;
      await mkdir(
        join(
          selectedHome,
          ...METHODOLOGY_PLUGIN_CACHE_SEGMENTS,
          ...methodology.source.split("/"),
          observation.version ?? "",
        ),
        {
          recursive: true,
        },
      );
      const observed = await createMethodologyContextProbe(codexHome, claudeHome).probe(methodology);
      expect(observed.version).toBe(observation.version);
    });
  });
}

export async function assertDefaultMethodologyProbeReadsAgentHomesAtProbeTime(): Promise<void> {
  const { methodology, observation } = resolvedMethodologyScenario();
  await withTempDir("spx-methodology-default-codex-", async (codexHome) => {
    await withTempDir("spx-methodology-default-claude-", async (claudeHome) => {
      await mkdir(
        join(
          codexHome,
          ...METHODOLOGY_PLUGIN_CACHE_SEGMENTS,
          ...methodology.source.split("/"),
          observation.version ?? "",
        ),
        {
          recursive: true,
        },
      );
      await withAgentHomeEnv(codexHome, claudeHome, async () => {
        const observed = await defaultMethodologyContextProbe.probe(methodology);
        expect(observed.version).toBe(observation.version);
      });
    });
  });
}
