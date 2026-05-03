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
import {
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_LITERAL_VALUES_SUBSECTION,
  VALIDATION_SECTION,
} from "@/validation/config/descriptor";
import { LITERAL_DEFAULTS, type LiteralAllowlistConfig } from "@/validation/literal/config";
import { LITERAL_TEST_GENERATOR, sampleLiteralTestValue } from "@testing/generators/literal/literal";
import type { Config, SpecTreeEnv } from "@testing/harnesses/spec-tree/spec-tree";

function literalSection(values: Record<string, unknown>): Config {
  return {
    [VALIDATION_SECTION]: {
      [VALIDATION_LITERAL_SUBSECTION]: {
        [VALIDATION_LITERAL_VALUES_SUBSECTION]: values,
      },
    },
  };
}

export function buildBaselineConfig(): Config {
  return literalSection({ ...LITERAL_DEFAULTS });
}

export function buildConfigWithAllowlist(allowlist: LiteralAllowlistConfig): Config {
  return literalSection({ ...LITERAL_DEFAULTS, allowlist });
}

export function buildConfigWithForeignSection(
  foreignKey: string,
  foreignBody: Record<string, unknown>,
): Config {
  return {
    ...literalSection({ ...LITERAL_DEFAULTS }),
    [foreignKey]: foreignBody,
  };
}

export async function writeProjectConfig(
  env: SpecTreeEnv,
  format: ConfigFileFormat,
  config: Config,
): Promise<void> {
  for (const registeredFormat of CONFIG_FILE_FORMAT_ORDER) {
    await rm(
      join(env.projectDir, CONFIG_FILE_DEFINITIONS[registeredFormat].filename),
      { force: true },
    );
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

export async function writeDuplicatedLiteralFixture(
  env: SpecTreeEnv,
  literal: string,
): Promise<void> {
  const sourcePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
  const testPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
  await env.writeRaw(sourcePath, `export const FIXTURE_VALUE = "${literal}";\n`);
  await env.writeRaw(testPath, `expect(value).toBe("${literal}");\n`);
}

export async function writeMultipleLiteralFixtures(
  env: SpecTreeEnv,
  literals: readonly string[],
): Promise<void> {
  for (const [index, literal] of literals.entries()) {
    const sourcePath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.sourceFilePath());
    const testPath = sampleLiteralTestValue(LITERAL_TEST_GENERATOR.testFilePath());
    await env.writeRaw(sourcePath, `export const MULTI_VALUE_${index} = "${literal}";\n`);
    await env.writeRaw(testPath, `expect(value).toBe("${literal}");\n`);
  }
}

export function readLiteralAllowlist(parsedConfig: unknown): LiteralAllowlistConfig {
  if (typeof parsedConfig !== "object" || parsedConfig === null) {
    throw new Error("parsed config is not an object");
  }
  const validation = (parsedConfig as Record<string, unknown>)[VALIDATION_SECTION];
  if (typeof validation !== "object" || validation === null) {
    throw new Error(`parsed config missing ${VALIDATION_SECTION} section`);
  }
  const literal = (validation as Record<string, unknown>)[VALIDATION_LITERAL_SUBSECTION];
  if (typeof literal !== "object" || literal === null) {
    throw new Error(`parsed config missing ${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION} section`);
  }
  const values = (literal as Record<string, unknown>)[VALIDATION_LITERAL_VALUES_SUBSECTION];
  if (typeof values !== "object" || values === null) {
    throw new Error(
      `parsed config missing ${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION}.${VALIDATION_LITERAL_VALUES_SUBSECTION} section`,
    );
  }
  const allowlist = (values as Record<string, unknown>)["allowlist"];
  if (typeof allowlist !== "object" || allowlist === null) {
    throw new Error(
      `parsed config missing ${VALIDATION_SECTION}.${VALIDATION_LITERAL_SUBSECTION}.${VALIDATION_LITERAL_VALUES_SUBSECTION}.allowlist section`,
    );
  }
  return allowlist as LiteralAllowlistConfig;
}
