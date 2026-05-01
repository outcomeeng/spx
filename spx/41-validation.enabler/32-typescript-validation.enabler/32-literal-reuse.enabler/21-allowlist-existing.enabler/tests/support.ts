import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT_ORDER,
  type ConfigFileFormat,
  parseConfigFileSections,
  readProjectConfigFile,
  serializeConfigFileSections,
} from "@/config/index";
import type { Config, SpecTreeEnv } from "@/spec/testing/index";
import {
  DEFAULT_MIN_NUMBER_DIGITS,
  DEFAULT_MIN_STRING_LENGTH,
  LITERAL_SECTION,
  type LiteralAllowlistConfig,
  type LiteralConfig,
} from "@/validation/literal/config";

export const SHARED_FIXTURE_LITERAL = "fixture-allowlist-target-literal";
export const EXISTING_INCLUDE_FIRST = "preexisting-allowlist-entry-alpha";
export const EXISTING_INCLUDE_SECOND = "preexisting-allowlist-entry-beta";
export const WEB_PRESET_NAME = "web";
export const SAMPLE_EXCLUDE_VALUE = "explicitly-excluded-allowlist-value";

export const MULTI_FINDINGS_LITERALS = [
  "zeta-multi-fixture-literal",
  "alpha-multi-fixture-literal",
  "mu-multi-fixture-literal",
] as const;

export const FOREIGN_SECTION_KEY = "foreignFixtureSection";
export const FOREIGN_SECTION_BODY = { foreignKey: "foreign-section-marker-value" } as const;

const FIXTURE_SOURCE_PATH = "src/fixture-source.ts";
const FIXTURE_TEST_PATH = "spx/aux-fixture.enabler/tests/duplicated.scenario.l1.test.ts";

const BASE_LITERAL_CONFIG: LiteralConfig = {
  allowlist: {},
  minStringLength: DEFAULT_MIN_STRING_LENGTH,
  minNumberDigits: DEFAULT_MIN_NUMBER_DIGITS,
};

export function buildBaselineConfig(): Config {
  return { [LITERAL_SECTION]: BASE_LITERAL_CONFIG };
}

export function buildConfigWithAllowlist(allowlist: LiteralAllowlistConfig): Config {
  return { [LITERAL_SECTION]: { ...BASE_LITERAL_CONFIG, allowlist } };
}

export function buildConfigWithForeignSection(): Config {
  return {
    [LITERAL_SECTION]: BASE_LITERAL_CONFIG,
    [FOREIGN_SECTION_KEY]: FOREIGN_SECTION_BODY,
  };
}

export async function writeProjectConfig(
  env: SpecTreeEnv,
  format: ConfigFileFormat,
  config: Config,
): Promise<void> {
  for (const registeredFormat of CONFIG_FILE_FORMAT_ORDER) {
    await rm(join(env.projectDir, CONFIG_FILE_DEFINITIONS[registeredFormat].filename), { force: true });
  }

  const serialized = serializeConfigFileSections(format, config as Record<string, unknown>);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }

  await env.writeRaw(CONFIG_FILE_DEFINITIONS[format].filename, serialized.value);
}

export async function readProjectConfigSections(env: SpecTreeEnv): Promise<Record<string, unknown>> {
  const read = await readProjectConfigFile(env.projectDir);
  if (!read.ok) {
    throw new Error(read.error);
  }
  if (read.value.kind !== "ok") {
    throw new Error(`expected one project config file, got ${read.value.kind}`);
  }
  const parsed = parseConfigFileSections(read.value.file);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

export async function writeDuplicatedLiteralFixture(env: SpecTreeEnv): Promise<void> {
  await env.writeRaw(
    FIXTURE_SOURCE_PATH,
    `export const FIXTURE_VALUE = "${SHARED_FIXTURE_LITERAL}";\n`,
  );
  await env.writeRaw(
    FIXTURE_TEST_PATH,
    `expect(value).toBe("${SHARED_FIXTURE_LITERAL}");\n`,
  );
}

export async function writeMultipleLiteralFixtures(
  env: SpecTreeEnv,
  literals: readonly string[],
): Promise<void> {
  for (const [index, literal] of literals.entries()) {
    const sourcePath = `src/multi-source-${index}.ts`;
    const testPath = `spx/aux-fixture.enabler/tests/multi-${index}.scenario.l1.test.ts`;
    await env.writeRaw(sourcePath, `export const MULTI_VALUE_${index} = "${literal}";\n`);
    await env.writeRaw(testPath, `expect(value).toBe("${literal}");\n`);
  }
}

export function readLiteralAllowlist(parsedConfig: unknown): LiteralAllowlistConfig {
  if (typeof parsedConfig !== "object" || parsedConfig === null) {
    throw new Error("parsed config is not an object");
  }
  const literal = (parsedConfig as Record<string, unknown>)[LITERAL_SECTION];
  if (typeof literal !== "object" || literal === null) {
    throw new Error(`parsed config missing ${LITERAL_SECTION} section`);
  }
  const allowlist = (literal as Record<string, unknown>)["allowlist"];
  if (typeof allowlist !== "object" || allowlist === null) {
    throw new Error(`parsed config missing ${LITERAL_SECTION}.allowlist section`);
  }
  return allowlist as LiteralAllowlistConfig;
}
