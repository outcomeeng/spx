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
import type { Config } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
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
  readonly expectedKinds: readonly string[];
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

  for (const format of CONFIG_FILE_FORMAT_ORDER) {
    await withTestEnv(scenario.parentConfig, async ({ productDir, writeRaw }) => {
      await writeRaw(scenario.unrecognizedRelativePath, serializeConfig(format, scenario.nestedConfig));
      await writeRaw(
        writeConfigPath(join(scenario.productDirectory, scenario.nestedDirectory), format),
        serializeConfig(format, scenario.nestedConfig),
      );

      const result = await resolveConfig(join(productDir, scenario.productDirectory), [specTreeConfigDescriptor]);
      await consume({ result, expectedKinds: scenario.expectedDefaultKinds });
    });

    await withTestEnv(scenario.parentConfig, async ({ productDir, writeRaw }) => {
      await writeRaw(
        writeConfigPath(scenario.productDirectory, format),
        serializeConfig(format, scenario.rootConfig),
      );
      await writeRaw(scenario.unrecognizedRelativePath, serializeConfig(format, scenario.nestedConfig));
      await writeRaw(
        writeConfigPath(join(scenario.productDirectory, scenario.nestedDirectory), format),
        serializeConfig(format, scenario.nestedConfig),
      );

      const result = await resolveConfig(join(productDir, scenario.productDirectory), [specTreeConfigDescriptor]);
      await consume({ result, expectedKinds: scenario.expectedRootKinds });
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
      const parsed = read.ok && read.value.kind === "ok" ? parseConfigFileSections(read.value.file) : null;
      const serialized = parsed?.ok === true && read.ok && read.value.kind === "ok"
        ? serializeConfigFileSections(read.value.file.format, parsed.value)
        : null;
      const reparsed = serialized?.ok === true && read.ok && read.value.kind === "ok"
        ? parseConfigFileSections({ ...read.value.file, raw: serialized.value })
        : null;
      await consume({ expectedConfig: scenario.config, format, parsed, read, reparsed, serialized });
    });
  }
}
