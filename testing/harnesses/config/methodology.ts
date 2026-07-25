import {
  CONFIG_FILE_FORMAT,
  configFileForFormat,
  type ConfigFileFormat,
  resolveConfig,
  resolveConfigFromReadResult,
  serializeConfigFileSections,
} from "@/config/index";
import {
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  type MethodologyConfig,
  methodologyConfigDescriptor,
} from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import { productionRegistry } from "@/config/registry";
import type { Config, Result } from "@/config/types";
import { HARNESS_ENVIRONMENT_SECTION, harnessEnvironmentConfigDescriptor } from "@/domains/agent-environment/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

/** The finite invalid-source domain the methodology descriptor rejects. */
export const INVALID_METHODOLOGY_SOURCES = ["", "../outside", "/outside", "owner/../repo", "owner/repo/extra"] as const;
/** The finite invalid-version domain the methodology descriptor rejects. */
export const INVALID_METHODOLOGY_VERSIONS = ["", false] as const;
/** A harnessEnvironment field whose name resembles the methodology section without being it. */
export const SIMILAR_HARNESS_FIELD = "methodologySource";
/** An unrecognized harnessEnvironment field carried alongside a misplaced methodology section. */
export const STRAY_HARNESS_FIELD = "strayHarnessField";

export function generatedMethodologySection(): Record<string, unknown> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  };
}

export function generatedMethodologySource(): string {
  return [
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  ].join("/");
}

/** Resolves a product carrying no config file through the full production descriptor registry. */
export async function resolveMethodologyDefaultsFromProductionRegistry(): Promise<Result<Config>> {
  let resolved: Result<Config> | undefined;
  await withTestEnv({}, async ({ productDir }) => {
    resolved = await resolveConfig(productDir, productionRegistry);
  });
  if (resolved === undefined) throw new Error("methodology config resolution produced no result");
  return resolved;
}

/** Resolves a product whose config declares a generated methodology section, returning that section with the result. */
export async function resolveExplicitMethodologyConfig(): Promise<{
  readonly declared: Record<string, unknown>;
  readonly resolved: Result<Config>;
}> {
  const declared = generatedMethodologySection();
  let resolved: Result<Config> | undefined;
  await withTestEnv({ [METHODOLOGY_SECTION]: declared }, async ({ productDir }) => {
    resolved = await resolveConfig(productDir, [methodologyConfigDescriptor]);
  });
  if (resolved === undefined) throw new Error("methodology config resolution produced no result");
  return { declared, resolved };
}

/** One config file format's round trip: serialize the declared section, then resolve it back. */
export interface MethodologyFormatRoundTrip {
  readonly format: ConfigFileFormat;
  readonly serialized: Result<string>;
  readonly resolved: Result<Config> | undefined;
}

/**
 * Round-trips one generated methodology section through every supported config file format,
 * returning the descriptor's own validation of that section as the independent oracle.
 */
export function roundTripMethodologyConfigFormats(): {
  readonly expected: Result<MethodologyConfig>;
  readonly roundTrips: readonly MethodologyFormatRoundTrip[];
} {
  const methodology = generatedMethodologySection();
  const config = { [METHODOLOGY_SECTION]: methodology };
  const expected = methodologyConfigDescriptor.validate(methodology);
  const roundTrips = CONFIG_FILE_FORMAT_ORDER_FOR_TESTS.map((format) => {
    const serialized = serializeConfigFileSections(format, config);
    if (!serialized.ok) return { format, serialized, resolved: undefined };
    return {
      format,
      serialized,
      resolved: resolveConfigFromReadResult({
        kind: "ok",
        file: configFileForFormat("", format, serialized.value),
      }, [methodologyConfigDescriptor]),
    };
  });
  return { expected, roundTrips };
}

/** Resolves a product whose methodology section carries the supplied source value. */
export async function resolveMethodologySource(source: unknown): Promise<Result<Config>> {
  let resolved: Result<Config> | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: source,
    },
  }, async ({ productDir }) => {
    resolved = await resolveConfig(productDir, [methodologyConfigDescriptor]);
  });
  if (resolved === undefined) throw new Error("methodology config resolution produced no result");
  return resolved;
}

/** Resolves a product whose methodology section carries a valid source and the supplied version value. */
export async function resolveMethodologyVersion(version: unknown): Promise<Result<Config>> {
  let resolved: Result<Config> | undefined;
  await withTestEnv({
    [METHODOLOGY_SECTION]: {
      [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
      [METHODOLOGY_CONFIG_FIELDS.VERSION]: version,
    },
  }, async ({ productDir }) => {
    resolved = await resolveConfig(productDir, [methodologyConfigDescriptor]);
  });
  if (resolved === undefined) throw new Error("methodology config resolution produced no result");
  return resolved;
}

/** Resolves the harnessEnvironment descriptor against a config that misplaces methodology under it. */
export async function resolveHarnessEnvironmentWithMethodologySection(): Promise<Result<Config>> {
  let resolved: Result<Config> | undefined;
  await withTestEnv({
    [HARNESS_ENVIRONMENT_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
    },
  }, async ({ productDir }) => {
    resolved = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
  });
  if (resolved === undefined) throw new Error("harnessEnvironment config resolution produced no result");
  return resolved;
}

/** Resolves methodology config against a harnessEnvironment section carrying methodology among stray fields. */
export async function resolveMethodologyWithStrayHarnessFields(): Promise<Result<MethodologyConfig>> {
  let resolved: Result<MethodologyConfig> | undefined;
  await withTestEnv({
    [HARNESS_ENVIRONMENT_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
      [STRAY_HARNESS_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    },
  }, async ({ productDir }) => {
    resolved = await resolveMethodologyConfig(productDir);
  });
  if (resolved === undefined) throw new Error("methodology resolution produced no result");
  return resolved;
}

/** Resolves methodology config against a harnessEnvironment section carrying only a similarly named field. */
export async function resolveMethodologyWithSimilarHarnessField(): Promise<Result<MethodologyConfig>> {
  let resolved: Result<MethodologyConfig> | undefined;
  await withTestEnv({
    [HARNESS_ENVIRONMENT_SECTION]: {
      [SIMILAR_HARNESS_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    },
  }, async ({ productDir }) => {
    resolved = await resolveMethodologyConfig(productDir);
  });
  if (resolved === undefined) throw new Error("methodology resolution produced no result");
  return resolved;
}

const CONFIG_FILE_FORMAT_ORDER_FOR_TESTS = [
  CONFIG_FILE_FORMAT.JSON,
  CONFIG_FILE_FORMAT.YAML,
  CONFIG_FILE_FORMAT.TOML,
] as const;
