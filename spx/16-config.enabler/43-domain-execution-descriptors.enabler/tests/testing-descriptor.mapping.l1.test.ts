import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { testingConfigDescriptor } from "@/testing/config";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function serializeConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config as Record<string, unknown>);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

describe("testing config descriptor format mapping", () => {
  it("resolves equivalent testing sections from JSON, YAML, and TOML config files", async () => {
    const generated = sampleConfigTestValue(CONFIG_TEST_GENERATOR.testingConfig());
    const results: Partial<Record<ConfigFileFormat, unknown>> = {};

    await withTestEnv(generated.config, async ({ productDir }) => {
      const result = await resolveConfig(productDir, [testingConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) results[DEFAULT_CONFIG_FILE_FORMAT] = result.value;
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.json, serializeConfig(CONFIG_FILE_FORMAT.JSON, generated.config));
      const result = await resolveConfig(productDir, [testingConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) results[CONFIG_FILE_FORMAT.JSON] = result.value;
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.toml, serializeConfig(CONFIG_FILE_FORMAT.TOML, generated.config));
      const result = await resolveConfig(productDir, [testingConfigDescriptor]);
      expect(result.ok).toBe(true);
      if (result.ok) results[CONFIG_FILE_FORMAT.TOML] = result.value;
    });

    expect(Object.keys(results)).toHaveLength(Object.keys(CONFIG_FILENAMES).length);
    expect(results[CONFIG_FILE_FORMAT.JSON]).toEqual(results[DEFAULT_CONFIG_FILE_FORMAT]);
    expect(results[CONFIG_FILE_FORMAT.TOML]).toEqual(results[DEFAULT_CONFIG_FILE_FORMAT]);
  });
});
