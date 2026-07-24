import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { diagnoseCommand } from "@/commands/diagnose";
import { createMethodologyContextProbe, PLUGIN_CACHE_SEGMENTS } from "@/commands/diagnose/probes";
import {
  DEFAULT_METHODOLOGY_VERSION,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
} from "@/config/methodology";
import { LEGACY_METHODOLOGY_CONFIG_SECTION } from "@/config/methodology-placement";
import { AGENT_HOME_ENV } from "@/domains/agent";
import {
  type MethodologyContextObservation,
  methodologyContextRunner,
} from "@/domains/diagnose/checks/methodology-context";
import { DIAGNOSE_CONFIG_FIELDS, DIAGNOSE_SECTION } from "@/domains/diagnose/config";
import { type CheckRegistry, runDiagnose } from "@/domains/diagnose/engine";
import { CHECK_NAME } from "@/domains/diagnose/manifest";
import { DIAGNOSE_FORMAT } from "@/domains/diagnose/report";
import type { DiagnoseReport } from "@/domains/diagnose/types";
import { SPEC_TREE_CONFIG } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

/**
 * Methodology-cache fixture inputs. Version-shaped names order numerically rather than
 * lexically, so `PATCH_10` sorts above `PATCH_2`; `UNORDERED` and `EXACT_ONLY` are the
 * non-version directory names a cache can also carry.
 */
export const METHODOLOGY_CACHE_VERSION = {
  PATCH_2: "0.74.2",
  PATCH_1: "0.74.1",
  PATCH_10: "0.74.10",
  UNORDERED: "999x",
  EXACT_ONLY: "stable",
} as const;

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
  return {
    source: methodology.source,
    version: METHODOLOGY_CACHE_VERSION.PATCH_2,
    trackedSpecTree,
    errored: false,
  };
}

/** An observation carrying no resolvable source or version, parameterized by probe failure. */
export function unresolvedMethodology(errored: boolean): MethodologyContextObservation {
  return { source: null, version: null, trackedSpecTree: false, errored };
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

/** Materializes one temp agent home for methodology-cache fixtures. */
export async function withAgentHome(callback: (agentHome: string) => Promise<void>): Promise<void> {
  await withTempDir("spx-methodology-agent-home-", callback);
}

/** Materializes two temp agent homes so a fixture can span the Codex and Claude Code caches. */
export async function withAgentHomePair(
  callback: (codexHome: string, claudeHome: string) => Promise<void>,
): Promise<void> {
  await withAgentHome(async (codexHome) => {
    await withAgentHome(async (claudeHome) => {
      await callback(codexHome, claudeHome);
    });
  });
}

/** Creates the plugin-cache directory one methodology source version resolves from under an agent home. */
export async function installMethodologyVersion(
  agentHome: string,
  methodology: MethodologyConfig,
  version: string,
): Promise<void> {
  await mkdir(join(agentHome, ...PLUGIN_CACHE_SEGMENTS, ...methodology.source.split("/"), version), {
    recursive: true,
  });
}

/** Writes a file where the plugin-cache directory belongs, so reading that cache errors. */
export async function breakMethodologyCache(agentHome: string): Promise<void> {
  await writeFile(join(agentHome, BROKEN_PLUGIN_CACHE_SEGMENT), BROKEN_PLUGIN_CACHE_FILE_CONTENT);
}

/**
 * Probes the configured methodology with the supplied agent homes named explicitly. Cache-resolution
 * assertions judge observed-version selection only, so the first agent home — a temp directory
 * carrying no tracked spec tree — serves as the product directory.
 */
export function probeOverAgentHomes(
  methodology: MethodologyConfig,
  ...agentHomeDirs: readonly string[]
): Promise<MethodologyContextObservation> {
  return createMethodologyContextProbe(agentHomeDirs[0], ...agentHomeDirs).probe(methodology);
}

/**
 * Constructs a probe through the default shape the CLI uses — a product directory and no explicit
 * agent homes — BEFORE the agent-home environment variables name the supplied homes, then probes
 * inside that environment. Construction outside the environment window and probing inside it is
 * what makes the observation evidence of at-probe-time home resolution: a probe that resolved its
 * homes eagerly at construction would miss the homes exported afterwards.
 */
export async function probeConstructedBeforeAgentHomeEnv(
  methodology: MethodologyConfig,
  productDir: string,
  codexHome: string,
  claudeHome: string,
): Promise<MethodologyContextObservation> {
  const probe = createMethodologyContextProbe(productDir);
  let observed: MethodologyContextObservation | undefined;
  await withAgentHomeEnv(codexHome, claudeHome, async () => {
    observed = await probe.probe(methodology);
  });
  if (observed === undefined) throw new Error("methodology probe produced no observation");
  return observed;
}

function registryFor(observation: MethodologyContextObservation): CheckRegistry {
  return {
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
      probe: () => Promise.resolve(observation),
    }),
  };
}

function methodologySection(methodology: MethodologyConfig): Record<string, string> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: methodology.source,
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version,
  };
}

/**
 * Runs `spx diagnose --format json` over a temp product directory carrying the supplied
 * methodology config and the supplied injected observation, returning the parsed report.
 * Owns the temp-environment lifecycle only; the calling test file owns every verdict.
 */
export async function runMethodologyDiagnoseJson(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<Record<string, unknown>> {
  let output: string | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: methodologySection(methodology),
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      format: DIAGNOSE_FORMAT.JSON,
      color: false,
      registry: registryFor(observation),
      fs: { readFile: () => Promise.resolve("") },
    });
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return JSON.parse(output) as Record<string, unknown>;
}

/** Runs `spx diagnose` in text format over the supplied methodology config and observation. */
export async function runMethodologyDiagnoseText(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<string> {
  let output: string | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: methodologySection(methodology),
  }, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor(observation),
      fs: { readFile: () => Promise.resolve("") },
    });
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return output;
}

/** Runs a manifest-driven diagnose selecting methodology-context without methodology facts, returning the error. */
export async function runMethodologyManifestWithoutFacts(): Promise<string> {
  let error: string | undefined;
  await withTestEnv({}, async ({ productDir }) => {
    const result = await diagnoseCommand({
      productDir,
      manifestPath: "diagnose.json",
      format: DIAGNOSE_FORMAT.TEXT,
      color: false,
      registry: registryFor(unresolvedMethodology(false)),
      fs: {
        readFile: () => Promise.resolve(JSON.stringify({ checks: [CHECK_NAME.METHODOLOGY_CONTEXT] })),
      },
    });
    if (!result.ok) error = result.error;
  });
  if (error === undefined) throw new Error("diagnose command produced no error");
  return error;
}

/** Runs a manifest-driven diagnose carrying methodology facts, returning the parsed report. */
export async function runMethodologyManifestJson(
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
            [METHODOLOGY_SECTION]: methodologySection(methodology),
          })),
      },
    });
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return JSON.parse(output) as Record<string, unknown>;
}

/** Runs diagnose against a product whose config still carries the legacy harness methodology section. */
export async function runDiagnoseWithLegacyMethodologySection(): Promise<string> {
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
      registry: registryFor(unresolvedMethodology(false)),
      fs: { readFile: () => Promise.resolve("") },
    });
    if (!result.ok) error = result.error;
  });
  if (error === undefined) throw new Error("diagnose command produced no error");
  return error;
}

/** Runs diagnose against a product carrying top-level methodology config plus an unrelated legacy-section defect. */
export async function runDiagnoseWithUnrelatedLegacyDefect(
  methodology: MethodologyConfig,
  observation: MethodologyContextObservation,
): Promise<Record<string, unknown>> {
  let output: string | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: methodologySection(methodology),
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
    if (!result.ok) throw new Error(result.error);
    output = result.value.output;
  });
  if (output === undefined) throw new Error("diagnose command produced no output");
  return JSON.parse(output) as Record<string, unknown>;
}

/** A check name this build does not provide, for the unavailable-check rejection fixture. */
export function unavailableCheckName(): string {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.key());
}

/** Runs diagnose whose config selects an unavailable check alongside a legacy methodology section. */
export async function runDiagnoseWithUnavailableCheck(unavailableCheck: string): Promise<string> {
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
      registry: registryFor(unresolvedMethodology(false)),
      fs: { readFile: () => Promise.resolve("") },
    });
    if (!result.ok) error = result.error;
  });
  if (error === undefined) throw new Error("diagnose command produced no error");
  return error;
}

/**
 * Runs the methodology-context check with no methodology fact resolved, through a probe that
 * throws if it is ever reached, and returns the folded report.
 */
export async function runMethodologyRunnerWithoutFacts(): Promise<DiagnoseReport> {
  const result = await runDiagnose({
    checks: [CHECK_NAME.METHODOLOGY_CONTEXT],
  }, {
    [CHECK_NAME.METHODOLOGY_CONTEXT]: methodologyContextRunner({
      probe: () => {
        throw new Error("missing methodology facts must not call the methodology probe");
      },
    }),
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Reads the first check record out of a rendered or folded diagnose report. */
export function firstCheck(report: DiagnoseReport | Record<string, unknown>): Record<string, unknown> {
  const checks = report.checks;
  if (!Array.isArray(checks)) throw new Error("diagnose report checks are not an array");
  const [check] = checks;
  if (typeof check !== "object" || check === null) throw new Error("diagnose report has no first check");
  return check as Record<string, unknown>;
}
