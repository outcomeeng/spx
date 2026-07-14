import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_FILE_FORMAT,
  CONFIG_FILENAMES,
  configFileForFormat,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILENAME,
  resolveConfig,
  serializeConfigFileSections,
  serializeConfigFileSectionsWithSetIn,
} from "@/config/index";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";
import type { Config } from "@testing/harnesses/spec-tree/spec-tree";
import { withTestEnv } from "@testing/harnesses/spec-tree/spec-tree";

function equivalentConfig(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
}

function serializeEquivalentConfig(format: ConfigFileFormat, config: Config): string {
  const serialized = serializeConfigFileSections(format, config);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

describe("resolveConfig — format equivalence", () => {
  it("spx.config.json produces the same typed Config as the default config format with equivalent content", async () => {
    let defaultResult: unknown;
    let jsonResult: unknown;
    const config = equivalentConfig();

    await withTestEnv(config, async ({ productDir }) => {
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) defaultResult = r.value;
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.json, serializeEquivalentConfig(CONFIG_FILE_FORMAT.JSON, config));
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) jsonResult = r.value;
    });

    expect(jsonResult).toEqual(defaultResult);
  });

  it("spx.config.toml produces the same typed Config as the default config format with equivalent content", async () => {
    let defaultResult: unknown;
    let tomlResult: unknown;
    const config = equivalentConfig();

    await withTestEnv(config, async ({ productDir }) => {
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) defaultResult = r.value;
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.toml, serializeEquivalentConfig(CONFIG_FILE_FORMAT.TOML, config));
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) tomlResult = r.value;
    });

    expect(tomlResult).toEqual(defaultResult);
  });

  it("all three formats produce identical typed Configs for the same key-value structure", async () => {
    const results: unknown[] = [];
    const config = equivalentConfig();

    await withTestEnv(config, async ({ productDir }) => {
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.json, serializeEquivalentConfig(CONFIG_FILE_FORMAT.JSON, config));
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    await withTestEnv({}, async ({ productDir, writeRaw }) => {
      await rm(join(productDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.toml, serializeEquivalentConfig(CONFIG_FILE_FORMAT.TOML, config));
      const r = await resolveConfig(productDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    expect(results).toHaveLength(Object.keys(CONFIG_FILENAMES).length);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("rejects config mutation requests without a section path", async () => {
    await withTestEnv({}, async ({ productDir }) => {
      const result = serializeConfigFileSectionsWithSetIn(
        configFileForFormat(productDir),
        [],
        {},
      );

      expect(result.ok).toBe(false);
    });
  });
});
