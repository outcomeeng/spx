import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILE_FORMAT_ORDER,
  CONFIG_FILENAMES,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSections,
} from "@/config/index";
import { testingConfigDescriptor } from "@/test/config";
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

    for (const format of CONFIG_FILE_FORMAT_ORDER) {
      await withTestEnv({}, async ({ productDir, writeRaw }) => {
        // withTestEnv writes the default config file; this test replaces it to isolate each format.
        await rm(join(productDir, DEFAULT_CONFIG_FILENAME), { force: true });
        await writeRaw(CONFIG_FILENAMES[format], serializeConfig(format, generated.config));
        const result = await resolveConfig(productDir, [testingConfigDescriptor]);
        expect(result.ok).toBe(true);
        if (result.ok) results[format] = result.value;
      });
    }

    expect(Object.keys(results).sort()).toEqual([...CONFIG_FILE_FORMAT_ORDER].sort());
    expect(results[CONFIG_FILE_FORMAT.JSON]).toEqual(results[CONFIG_FILE_FORMAT.YAML]);
    expect(results[CONFIG_FILE_FORMAT.TOML]).toEqual(results[CONFIG_FILE_FORMAT.YAML]);
  });
});
