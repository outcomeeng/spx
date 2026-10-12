import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  CONFIG_FILE_DEFINITIONS,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILE_READ_KIND,
  type ConfigFileFormat,
  parseConfigFileSections,
  readProductConfigFile,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import type { Config } from "@/config/types";
import {
  CONFIG_TEST_FIELDS,
  CONFIG_TEST_GENERATOR,
  sampleConfigTestValue,
} from "@testing/generators/config/descriptors";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

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
  readonly section: string;
  readonly expectedSection: unknown;
  readonly result: Awaited<ReturnType<typeof resolveConfig>>;
};

export type ConfigFormatObservation = {
  readonly expectedConfig: Config;
  readonly format: ConfigFileFormat;
  readonly parsed: ReturnType<typeof parseConfigFileSections> | null;
  readonly read: Awaited<ReturnType<typeof readProductConfigFile>>;
  readonly reparsed: ReturnType<typeof parseConfigFileSections> | null;
  readonly serialized: ReturnType<typeof serializeConfigFileSections> | null;
};

type ObservationConsumer<T> = (observation: T) => void | Promise<void>;

export async function forEachResolutionScopeObservation(
  consume: ObservationConsumer<ResolutionScopeObservation>,
): Promise<void> {
  const scenario = sampleConfigTestValue(CONFIG_TEST_GENERATOR.resolutionScopeScenario());
  const { section, defaults } = scenario.descriptor;
  const tokenSection = (token: string): Config => ({ [section]: { [CONFIG_TEST_FIELDS.TOKEN]: token } });

  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    await withTestEnv(tokenSection(scenario.parentToken), async ({ productDir, writeRaw }) => {
      await writeRaw(
        join(scenario.productDirectory, scenario.unrecognizedName),
        serializeConfig(format, tokenSection(scenario.nestedToken)),
      );
      await writeRaw(
        writeConfigPath(join(scenario.productDirectory, scenario.nestedDirectory), format),
        serializeConfig(format, tokenSection(scenario.nestedToken)),
      );

      const result = await resolveConfig(join(productDir, scenario.productDirectory), [
        scenario.descriptor.descriptor,
      ]);
      await consume({ section, expectedSection: defaults, result });
    });

    await withTestEnv(tokenSection(scenario.parentToken), async ({ productDir, writeRaw }) => {
      await writeRaw(
        writeConfigPath(scenario.productDirectory, format),
        serializeConfig(format, tokenSection(scenario.rootToken)),
      );
      await writeRaw(
        join(scenario.productDirectory, scenario.unrecognizedName),
        serializeConfig(format, tokenSection(scenario.nestedToken)),
      );
      await writeRaw(
        writeConfigPath(join(scenario.productDirectory, scenario.nestedDirectory), format),
        serializeConfig(format, tokenSection(scenario.nestedToken)),
      );

      const result = await resolveConfig(join(productDir, scenario.productDirectory), [
        scenario.descriptor.descriptor,
      ]);
      await consume({ section, expectedSection: tokenSection(scenario.rootToken)[section], result });
    });
  }
}

export async function forEachConfigFormatObservation(
  consume: ObservationConsumer<ConfigFormatObservation>,
): Promise<void> {
  const scenario = sampleConfigTestValue(CONFIG_TEST_GENERATOR.configFormatScenario());

  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      for (const registeredFormat of CONFIG_FILE_FORMAT_ORDER) {
        await rm(join(productDir, CONFIG_FILE_DEFINITIONS[registeredFormat].filename), { force: true });
      }
      await writeRaw(CONFIG_FILE_DEFINITIONS[format].filename, serializeConfig(format, scenario.config));

      const read = await readProductConfigFile(productDir);
      const parsed = read.ok && read.value.kind === CONFIG_FILE_READ_KIND.OK
        ? parseConfigFileSections(read.value.file)
        : null;
      const serialized = parsed?.ok === true && read.ok && read.value.kind === CONFIG_FILE_READ_KIND.OK
        ? serializeConfigFileSections(read.value.file.format, parsed.value)
        : null;
      const reparsed = serialized?.ok === true && read.ok && read.value.kind === CONFIG_FILE_READ_KIND.OK
        ? parseConfigFileSections({ ...read.value.file, raw: serialized.value })
        : null;
      await consume({ expectedConfig: scenario.config, format, parsed, read, reparsed, serialized });
    });
  }
}
