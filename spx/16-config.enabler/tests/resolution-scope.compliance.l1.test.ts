import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT_ORDER,
  type ConfigFile,
  type ConfigFileFormat,
  parseConfigFileSections,
  readProjectConfigFile,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@/config/testing";
import {
  KIND_REGISTRY,
  SPEC_TREE_KIND_CATEGORY,
  specTreeConfigDescriptor,
  type SpecTreeKindCategory,
} from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

type ConfigKindDefinition = {
  readonly category: SpecTreeKindCategory;
  readonly suffix: string;
};

function buildSpecTreeConfig(kind: string, definition: ConfigKindDefinition): Config {
  return {
    [specTreeConfigDescriptor.section]: {
      kinds: {
        [kind]: definition,
      },
    },
  };
}

function readFirstKind(category: SpecTreeKindCategory): readonly [string, ConfigKindDefinition] {
  const entry = Object.entries(KIND_REGISTRY).find(([, definition]) => definition.category === category);
  if (entry === undefined) {
    throw new Error(`Missing registered ${category} kind for resolution-scope fixture`);
  }
  return entry;
}

function readResolvedSpecTree(config: Config): typeof specTreeConfigDescriptor.defaults {
  const validated = specTreeConfigDescriptor.validate(config[specTreeConfigDescriptor.section]);
  expect(validated.ok).toBe(true);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  return validated.value;
}

function serializeConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config as Record<string, unknown>);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

function writeConfigPath(
  directory: string,
  format: ConfigFileFormat,
): string {
  return join(directory, CONFIG_FILE_DEFINITIONS[format].filename);
}

function parseSerialized(file: ConfigFile, raw: string): Record<string, unknown> {
  const parsed = parseConfigFileSections({ ...file, raw });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

describe("resolveConfig — resolution scope (C1)", () => {
  it("reads only the config file at the supplied projectRoot for every config-owned format", async () => {
    const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
    const parentOnly = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.kindOverride(SPEC_TREE_KIND_CATEGORY.NODE),
    );
    const nestedOnly = sampleConfigTestValue(
      CONFIG_TEST_GENERATOR.kindOverride(SPEC_TREE_KIND_CATEGORY.NODE),
    );

    const [rootKind, rootDefinition] = readFirstKind(SPEC_TREE_KIND_CATEGORY.NODE);
    const rootConfig = buildSpecTreeConfig(rootKind, rootDefinition);
    const parentConfig = buildSpecTreeConfig(parentOnly.kind, parentOnly.definition);
    const nestedConfig = buildSpecTreeConfig(nestedOnly.kind, nestedOnly.definition);

    for (const format of CONFIG_FILE_FORMAT_ORDER) {
      await withTestEnv(parentConfig, async ({ projectDir, writeRaw }) => {
        await writeRaw(
          writeConfigPath(scope.projectDirectory, format),
          serializeConfig(format, rootConfig),
        );
        await writeRaw(
          writeConfigPath(join(scope.projectDirectory, scope.nestedDirectory), format),
          serializeConfig(format, nestedConfig),
        );

        const result = await resolveConfig(join(projectDir, scope.projectDirectory), [specTreeConfigDescriptor]);

        expect(result.ok).toBe(true);
        if (result.ok) {
          const specTree = readResolvedSpecTree(result.value);
          expect(Object.keys(specTree.kinds)).toEqual(Object.keys(readResolvedSpecTree(rootConfig).kinds));
        }
      });
    }
  });

  it("exposes config-owned read, parse, and serialize APIs for every declared config format", async () => {
    const [kind, definition] = readFirstKind(SPEC_TREE_KIND_CATEGORY.DECISION);
    const config = buildSpecTreeConfig(kind, definition);

    for (const format of CONFIG_FILE_FORMAT_ORDER) {
      await withTestEnv({}, async ({ projectDir, writeRaw }) => {
        for (const registeredFormat of CONFIG_FILE_FORMAT_ORDER) {
          await rm(join(projectDir, CONFIG_FILE_DEFINITIONS[registeredFormat].filename), { force: true });
        }
        await writeRaw(CONFIG_FILE_DEFINITIONS[format].filename, serializeConfig(format, config));

        const read = await readProjectConfigFile(projectDir);
        expect(read.ok).toBe(true);
        if (!read.ok || read.value.kind !== "ok") return;
        expect(read.value.file.format).toBe(format);

        const parsed = parseConfigFileSections(read.value.file);
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(readResolvedSpecTree(parsed.value)).toEqual(readResolvedSpecTree(config));

        const serialized = serializeConfigFileSections(read.value.file.format, parsed.value);
        expect(serialized.ok).toBe(true);
        if (!serialized.ok) return;
        expect(parseSerialized(read.value.file, serialized.value)).toEqual(parsed.value);
      });
    }
  });
});
