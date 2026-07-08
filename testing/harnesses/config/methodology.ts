import { expect } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  configFileForFormat,
  resolveConfig,
  resolveConfigFromReadResult,
  serializeConfigFileSections,
} from "@/config/index";
import {
  DEFAULT_METHODOLOGY_CONFIG,
  METHODOLOGY_CONFIG_FIELDS,
  METHODOLOGY_SECTION,
  methodologyConfigDescriptor,
} from "@/config/methodology";
import { resolveMethodologyConfig } from "@/config/methodology-placement";
import { productionRegistry } from "@/config/registry";
import {
  HARNESS_ENVIRONMENT_CONFIG_FIELDS,
  HARNESS_ENVIRONMENT_SECTION,
  harnessEnvironmentConfigDescriptor,
} from "@/domains/agent-environment/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

const INVALID_METHODOLOGY_SOURCES = ["", "../outside", "/outside", "owner/../repo", "owner/repo/extra"] as const;
const INVALID_METHODOLOGY_VERSIONS = ["", false] as const;
const SIMILAR_HARNESS_FIELD = "methodologySource";
const STRAY_HARNESS_FIELD = "strayHarnessField";

function generatedMethodologySection(): Record<string, unknown> {
  return {
    [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
    [METHODOLOGY_CONFIG_FIELDS.VERSION]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  };
}

function generatedMethodologySource(): string {
  return [
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
  ].join("/");
}

function expectMethodology(value: unknown): void {
  expect(value).toHaveProperty(METHODOLOGY_CONFIG_FIELDS.SOURCE);
  expect(value).toHaveProperty(METHODOLOGY_CONFIG_FIELDS.VERSION);
}

export async function assertMethodologyDefaultsResolveFromProductionRegistry(): Promise<void> {
  await withTestEnv({}, async ({ productDir }) => {
    const result = await resolveConfig(productDir, productionRegistry);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value[METHODOLOGY_SECTION]).toEqual(DEFAULT_METHODOLOGY_CONFIG);
  });
}

export async function assertExplicitMethodologyConfigResolves(): Promise<void> {
  const methodology = generatedMethodologySection();
  await withTestEnv({ [METHODOLOGY_SECTION]: methodology }, async ({ productDir }) => {
    const result = await resolveConfig(productDir, [methodologyConfigDescriptor]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value[METHODOLOGY_SECTION]).toEqual(methodology);
  });
}

export function assertMethodologyConfigFormatsResolveEquivalently(): void {
  const methodology = generatedMethodologySection();
  const config = { [METHODOLOGY_SECTION]: methodology };
  const expected = methodologyConfigDescriptor.validate(methodology);
  expect(expected.ok).toBe(true);
  if (!expected.ok) throw new Error(expected.error);
  for (const format of CONFIG_FILE_FORMAT_ORDER_FOR_TESTS) {
    const serialized = serializeConfigFileSections(format, config);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) throw new Error(serialized.error);
    const parsed = resolveConfigFromReadResult({
      kind: "ok",
      file: configFileForFormat("", format, serialized.value),
    }, [methodologyConfigDescriptor]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.value[METHODOLOGY_SECTION]).toEqual(expected.value);
  }
}

export async function assertMalformedMethodologyConfigRejects(): Promise<void> {
  for (const source of INVALID_METHODOLOGY_SOURCES) {
    await withTestEnv({
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: source,
      },
    }, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [methodologyConfigDescriptor]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.SOURCE}`);
      }
    });
  }
  for (const version of INVALID_METHODOLOGY_VERSIONS) {
    await withTestEnv({
      [METHODOLOGY_SECTION]: {
        [METHODOLOGY_CONFIG_FIELDS.SOURCE]: generatedMethodologySource(),
        [METHODOLOGY_CONFIG_FIELDS.VERSION]: version,
      },
    }, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [methodologyConfigDescriptor]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain(`${METHODOLOGY_SECTION}.${METHODOLOGY_CONFIG_FIELDS.VERSION}`);
      }
    });
  }
}

export async function assertHarnessEnvironmentMethodologyRejects(): Promise<void> {
  await withTestEnv({
    [HARNESS_ENVIRONMENT_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
    },
  }, async ({ productDir }) => {
    const result = await resolveConfig(productDir, [harnessEnvironmentConfigDescriptor]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(`${HARNESS_ENVIRONMENT_SECTION}.${METHODOLOGY_SECTION}`);
    }
  });
}

export async function assertMethodologyResolverRejectsHarnessMethodologyAmongUnknownFields(): Promise<void> {
  await withTestEnv({
    [HARNESS_ENVIRONMENT_SECTION]: {
      [METHODOLOGY_SECTION]: generatedMethodologySection(),
      [STRAY_HARNESS_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    },
  }, async ({ productDir }) => {
    const result = await resolveMethodologyConfig(productDir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(METHODOLOGY_SECTION);
    }
  });
}

export async function assertMethodologyResolverIgnoresSimilarHarnessField(): Promise<void> {
  await withTestEnv({
    [HARNESS_ENVIRONMENT_SECTION]: {
      [SIMILAR_HARNESS_FIELD]: sampleConfigTestValue(CONFIG_TEST_GENERATOR.key()),
    },
  }, async ({ productDir }) => {
    const result = await resolveMethodologyConfig(productDir);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(result.value).toEqual(DEFAULT_METHODOLOGY_CONFIG);
  });
}

export function assertHarnessEnvironmentDefaultsExcludeMethodology(): void {
  expect(harnessEnvironmentConfigDescriptor.defaults).not.toHaveProperty(METHODOLOGY_SECTION);
  expect(HARNESS_ENVIRONMENT_CONFIG_FIELDS).not.toHaveProperty("METHODOLOGY");
}

export function assertMethodologyConfigShape(value: unknown): void {
  expectMethodology(value);
}

const CONFIG_FILE_FORMAT_ORDER_FOR_TESTS = [
  CONFIG_FILE_FORMAT.JSON,
  CONFIG_FILE_FORMAT.YAML,
  CONFIG_FILE_FORMAT.TOML,
] as const;
