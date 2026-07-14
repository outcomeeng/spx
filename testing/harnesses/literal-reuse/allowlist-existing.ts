import { rm } from "node:fs/promises";
import { join } from "node:path";

import * as fc from "fast-check";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT_ORDER,
  type ConfigFileFormat,
  parseConfigFileSections,
  readProductConfigFile,
  serializeConfigFileSections,
} from "@/config/index";
import {
  VALIDATION_LITERAL_SUBSECTION,
  VALIDATION_LITERAL_VALUES_SUBSECTION,
  VALIDATION_PATHS_SUBSECTION,
  VALIDATION_SECTION,
  type ValidationPathConfig,
} from "@/validation/config/descriptor";
import {
  LITERAL_DEFAULTS,
  type LiteralConfig,
  literalConfigDescriptor,
  type LiteralValueAllowlistConfig,
} from "@/validation/literal/config";
import { arbitraryDomainLiteral } from "@testing/generators/literal/literal";
import { assertProperty, PROPERTY_LEVEL, PROPERTY_SIZE } from "@testing/harnesses/property/property";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { collectHarnessTestCases, expect, it } from "@testing/harnesses/vitest-registration";

interface ConfigFixtureEnv {
  readonly productDir: string;
  readFile(relativePath: string): Promise<string>;
  writeRaw(relativePath: string, content: string): Promise<void>;
}

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

export function buildConfigWithAllowlist(allowlist: LiteralValueAllowlistConfig): Config {
  return literalSection({ ...LITERAL_DEFAULTS, ...allowlist });
}

export function buildConfigWithValidationPaths(
  paths: ValidationPathConfig,
  allowlist: LiteralValueAllowlistConfig = {},
): Config {
  return {
    [VALIDATION_SECTION]: {
      [VALIDATION_PATHS_SUBSECTION]: paths,
      [VALIDATION_LITERAL_SUBSECTION]: {
        [VALIDATION_LITERAL_VALUES_SUBSECTION]: { ...LITERAL_DEFAULTS, ...allowlist },
      },
    },
  };
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
  env: ConfigFixtureEnv,
  format: ConfigFileFormat,
  config: Config,
): Promise<void> {
  for (const registeredFormat of CONFIG_FILE_FORMAT_ORDER) {
    await rm(
      join(env.productDir, CONFIG_FILE_DEFINITIONS[registeredFormat].filename),
      { force: true },
    );
  }

  const serialized = serializeConfigFileSections(format, config);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }

  await env.writeRaw(CONFIG_FILE_DEFINITIONS[format].filename, serialized.value);
}

export async function readProductConfigSections(env: ConfigFixtureEnv): Promise<Record<string, unknown>> {
  const read = await readProductConfigFile(env.productDir);
  if (!read.ok) {
    throw new Error(read.error);
  }
  if (read.value.kind !== "ok") {
    throw new Error(`expected one product config file, got ${read.value.kind}`);
  }
  const parsed = parseConfigFileSections(read.value.file);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

export function readLiteralAllowlist(parsedConfig: unknown): LiteralConfig {
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
  const validated = literalConfigDescriptor.validate(values);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  return validated.value;
}

export const allowlistExistingHarnessPropertyCases = collectHarnessTestCases(() => {
  it("readLiteralAllowlist returns buildConfigWithAllowlist's include list merged over the literal defaults", () => {
    assertProperty(
      fc.array(arbitraryDomainLiteral()),
      (include) => {
        expect(readLiteralAllowlist(buildConfigWithAllowlist({ include }))).toEqual({
          ...LITERAL_DEFAULTS,
          include,
        });
      },
      { level: PROPERTY_LEVEL.L1, size: PROPERTY_SIZE.SMALL },
    );
  });
});
