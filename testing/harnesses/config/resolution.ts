import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT_ORDER,
  type ConfigFileFormat,
  parseConfigFileSections,
  readProductConfigFile,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import {
  KIND_REGISTRY,
  SPEC_TREE_KIND_CATEGORY,
  specTreeConfigDescriptor,
  type SpecTreeKindCategory,
} from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

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
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  return validated.value;
}

function serializeConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

function writeConfigPath(directory: string, format: ConfigFileFormat): string {
  return join(directory, CONFIG_FILE_DEFINITIONS[format].filename);
}

export type ResolutionScopeObservation = {
  readonly expectedKinds: readonly string[];
  readonly result: Awaited<ReturnType<typeof resolveConfig>>;
};

export type ConfigFormatObservation = {
  readonly expectedConfig: Config;
  readonly format: ConfigFileFormat;
  readonly parsed: ReturnType<typeof parseConfigFileSections> | undefined;
  readonly read: Awaited<ReturnType<typeof readProductConfigFile>>;
  readonly reparsed: ReturnType<typeof parseConfigFileSections> | undefined;
  readonly serialized: ReturnType<typeof serializeConfigFileSections> | undefined;
};

type ObservationConsumer<T> = (observation: T) => void | Promise<void>;

export async function forEachResolutionScopeObservation(
  consume: ObservationConsumer<ResolutionScopeObservation>,
): Promise<void> {
  const scope = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScope());
  const parentOnly = sampleConfigTestValue(CONFIG_TEST_GENERATOR.kindOverride(SPEC_TREE_KIND_CATEGORY.NODE));
  const nestedOnly = sampleConfigTestValue(CONFIG_TEST_GENERATOR.kindOverride(SPEC_TREE_KIND_CATEGORY.NODE));
  const [rootKind, rootDefinition] = readFirstKind(SPEC_TREE_KIND_CATEGORY.NODE);
  const rootConfig = buildSpecTreeConfig(rootKind, rootDefinition);
  const parentConfig = buildSpecTreeConfig(parentOnly.kind, parentOnly.definition);
  const nestedConfig = buildSpecTreeConfig(nestedOnly.kind, nestedOnly.definition);

  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    await withTestEnv(parentConfig, async ({ productDir, writeRaw }) => {
      await writeRaw(join(scope.productDirectory, nestedOnly.kind), serializeConfig(format, nestedConfig));
      await writeRaw(
        writeConfigPath(join(scope.productDirectory, scope.nestedDirectory), format),
        serializeConfig(format, nestedConfig),
      );

      const result = await resolveConfig(join(productDir, scope.productDirectory), [specTreeConfigDescriptor]);
      await consume({ result, expectedKinds: Object.keys(specTreeConfigDescriptor.defaults.kinds) });
    });

    await withTestEnv(parentConfig, async ({ productDir, writeRaw }) => {
      await writeRaw(writeConfigPath(scope.productDirectory, format), serializeConfig(format, rootConfig));
      await writeRaw(join(scope.productDirectory, nestedOnly.kind), serializeConfig(format, nestedConfig));
      await writeRaw(
        writeConfigPath(join(scope.productDirectory, scope.nestedDirectory), format),
        serializeConfig(format, nestedConfig),
      );

      const result = await resolveConfig(join(productDir, scope.productDirectory), [specTreeConfigDescriptor]);
      await consume({ result, expectedKinds: Object.keys(readResolvedSpecTree(rootConfig).kinds) });
    });
  }
}

export async function forEachConfigFormatObservation(
  consume: ObservationConsumer<ConfigFormatObservation>,
): Promise<void> {
  const [kind, definition] = readFirstKind(SPEC_TREE_KIND_CATEGORY.DECISION);
  const config = buildSpecTreeConfig(kind, definition);

  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      for (const registeredFormat of CONFIG_FILE_FORMAT_ORDER) {
        await rm(join(productDir, CONFIG_FILE_DEFINITIONS[registeredFormat].filename), { force: true });
      }
      await writeRaw(CONFIG_FILE_DEFINITIONS[format].filename, serializeConfig(format, config));

      const read = await readProductConfigFile(productDir);
      const parsed = read.ok && read.value.kind === "ok" ? parseConfigFileSections(read.value.file) : undefined;
      const serialized = parsed?.ok === true && read.ok && read.value.kind === "ok"
        ? serializeConfigFileSections(read.value.file.format, parsed.value)
        : undefined;
      const reparsed = serialized?.ok === true && read.ok && read.value.kind === "ok"
        ? parseConfigFileSections({ ...read.value.file, raw: serialized.value })
        : undefined;
      await consume({ expectedConfig: config, format, parsed, read, reparsed, serialized });
    });
  }
}
