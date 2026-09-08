import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { diagnoseCommand } from "@/commands/diagnose";
import { createMethodologyContextProbe } from "@/commands/diagnose/probes";
import {
  DEFAULT_METHODOLOGY_SOURCE,
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
import { METHODOLOGY_CODING_AGENTS } from "@/lib/methodology/coding-agent";
import { FOUNDATION_MANIFEST_RELATIVE_PATH } from "@/lib/methodology/foundation-manifest";
import { PROVIDER_MATCH } from "@/lib/methodology/provider-match";
import {
  formatMethodologySourceRecord,
  FOUNDATION_PLUGIN_NAME,
  methodologyLine,
  type MethodologySourceRecord,
  SOURCE_RECORD_RELATIVE_PATH,
} from "@/lib/methodology/tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { arbitraryMethodologyVersion } from "@testing/generators/methodology/tree";
import { sampleGeneratedValue } from "@testing/generators/sample";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";
import { withTempDir } from "@testing/harnesses/with-temp-dir";

const PLUGIN_CACHE_SEGMENTS = ["plugins", "cache"] as const;
const MANIFEST_PLACEHOLDER = "{}";

/** A methodology declaration with an exact generated version and no migration window. */
export function generatedMethodology(): MethodologyConfig {
  return { source: DEFAULT_METHODOLOGY_SOURCE, version: sampleGeneratedValue(arbitraryMethodologyVersion()).text };
}

/** A methodology declaration with an open migration window between two distinct exact versions. */
export function generatedMigratingMethodology(): MethodologyConfig {
  const [target, source] = sampleGeneratedValue(
    arbitraryMethodologyVersion().chain((first) =>
      arbitraryMethodologyVersion().filter((second) => second.text !== first.text).map((second) =>
        [first, second] as const
      )
    ),
  );
  return { source: DEFAULT_METHODOLOGY_SOURCE, version: target.text, migratingFrom: source.text };
}

/** A methodology declaration carrying no version. */
export function undeclaredMethodology(): MethodologyConfig {
  return { source: DEFAULT_METHODOLOGY_SOURCE };
}

/** The line a declared version derives to, for observations that name it. */
export function lineOf(methodology: MethodologyConfig): string {
  if (methodology.version === undefined) throw new Error("methodology declares no version");
  const line = methodologyLine(methodology.version);
  if (!line.ok) throw new Error(line.error);
  return line.value;
}

/** An observation of a declared line that ships a tree for every enabled coding agent, with no provider declaration. */
export function shippedObservation(methodology: MethodologyConfig): MethodologyContextObservation {
  const line = lineOf(methodology);
  return {
    line,
    shippedLines: [line],
    shippedCodingAgents: [...METHODOLOGY_CODING_AGENTS],
    enabledCodingAgents: [...METHODOLOGY_CODING_AGENTS],
    providerMatch: PROVIDER_MATCH.UNDECLARED,
    providerMismatch: undefined,
    errored: false,
  };
}

/** An observation of a declared line spx does not ship; `shippedLines` names what it does ship. */
export function unshippedObservation(
  methodology: MethodologyConfig,
  shippedLines: readonly string[],
): MethodologyContextObservation {
  return {
    line: lineOf(methodology),
    shippedLines,
    shippedCodingAgents: [],
    enabledCodingAgents: [...METHODOLOGY_CODING_AGENTS],
    providerMatch: undefined,
    providerMismatch: undefined,
    errored: false,
  };
}

/** An observation whose provider-declaration check failed with the supplied diagnostic. */
export function mismatchedObservation(
  methodology: MethodologyConfig,
  diagnostic: string,
): MethodologyContextObservation {
  return { ...shippedObservation(methodology), providerMatch: undefined, providerMismatch: diagnostic };
}

/** An observation carrying no derived line, parameterized by probe failure. */
export function unresolvedMethodology(errored: boolean): MethodologyContextObservation {
  return {
    line: undefined,
    shippedLines: [],
    shippedCodingAgents: [],
    enabledCodingAgents: [...METHODOLOGY_CODING_AGENTS],
    providerMatch: undefined,
    providerMismatch: undefined,
    errored,
  };
}

/** What a temp tree root carries per line: the coding agents with a tree, and an optional source record. */
export interface ShippedLineLayout {
  readonly codingAgents: readonly string[];
  readonly sourceRecord?: MethodologySourceRecord;
}

/** Materializes a temp directory standing in for spx's `methodology/` directory with the supplied lines. */
export async function withShippedTreeRoot(
  layout: Readonly<Record<string, ShippedLineLayout>>,
  callback: (treeRoot: string) => Promise<void>,
): Promise<void> {
  await withTempDir("spx-methodology-tree-root-", async (treeRoot) => {
    for (const [line, lineLayout] of Object.entries(layout)) {
      await mkdir(join(treeRoot, line), { recursive: true });
      for (const codingAgent of lineLayout.codingAgents) {
        const manifestPath = join(
          treeRoot,
          line,
          codingAgent,
          FOUNDATION_PLUGIN_NAME,
          FOUNDATION_MANIFEST_RELATIVE_PATH,
        );
        await mkdir(join(manifestPath, ".."), { recursive: true });
        await writeFile(manifestPath, MANIFEST_PLACEHOLDER);
      }
      if (lineLayout.sourceRecord !== undefined) {
        await writeFile(
          join(treeRoot, line, SOURCE_RECORD_RELATIVE_PATH),
          formatMethodologySourceRecord(lineLayout.sourceRecord),
        );
      }
    }
    await callback(treeRoot);
  });
}

/** A source record naming one provider declaration for every coding agent on a line. */
export function sourceRecordProviding(provides: string, supports?: string): MethodologySourceRecord {
  return {
    repository: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    revision: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    plugins: Object.fromEntries(
      METHODOLOGY_CODING_AGENTS.map((codingAgent) => [codingAgent, {
        name: FOUNDATION_PLUGIN_NAME,
        version: sampleGeneratedValue(arbitraryMethodologyVersion()).text,
        provides,
        ...(supports === undefined ? {} : { supports }),
      }]),
    ),
  };
}

/** Probes the declared methodology over a tree root with the supplied enabled coding agents; no product config is read. */
export function probeShippedTree(
  methodology: MethodologyConfig,
  treeRoot: string | undefined,
  enabledCodingAgents: readonly string[] = METHODOLOGY_CODING_AGENTS,
): Promise<MethodologyContextObservation> {
  return createMethodologyContextProbe({
    treeRoot,
    productDir: treeRoot ?? "",
    resolveEnabledCodingAgents: () => Promise.resolve(enabledCodingAgents),
  }).probe(methodology);
}

/**
 * Writes a plugin cache carrying the declared version under each supplied coding-agent home and exports
 * those homes for the callback, so a probe that reads any home would observe a line the tree root lacks.
 */
export async function withAgentHomesCarryingVersion(
  methodology: MethodologyConfig,
  callback: () => Promise<void>,
): Promise<void> {
  await withTempDir("spx-methodology-codex-home-", async (codexHome) => {
    await withTempDir("spx-methodology-claude-home-", async (claudeHome) => {
      for (const home of [codexHome, claudeHome]) {
        await mkdir(join(home, ...PLUGIN_CACHE_SEGMENTS, ...methodology.source.split("/"), lineOf(methodology)), {
          recursive: true,
        });
      }
      const previous = new Map(Object.values(AGENT_HOME_ENV).map((key) => [key, process.env[key]]));
      process.env[AGENT_HOME_ENV.CODEX] = codexHome;
      process.env[AGENT_HOME_ENV.CLAUDE] = claudeHome;
      try {
        await callback();
      } finally {
        for (const [key, value] of previous) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    });
  });
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
    ...(methodology.version === undefined ? {} : { [METHODOLOGY_CONFIG_FIELDS.VERSION]: methodology.version }),
    ...(methodology.migratingFrom === undefined
      ? {}
      : { [METHODOLOGY_CONFIG_FIELDS.MIGRATING_FROM]: methodology.migratingFrom }),
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
      [METHODOLOGY_SECTION]: methodologySection(generatedMethodology()),
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
      unrelated: methodologySection(generatedMethodology()),
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
      [METHODOLOGY_SECTION]: methodologySection(generatedMethodology()),
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
