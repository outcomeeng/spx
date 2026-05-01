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
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config";
import { withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

const EQUIV_CONFIG: Config = {
  [specTreeConfigDescriptor.section]: { kinds: { pdr: KIND_REGISTRY.pdr } },
};

function serializeEquivalentConfig(format: ConfigFileFormat): string {
  const serialized = serializeConfigFileSections(format, EQUIV_CONFIG as Record<string, unknown>);
  if (!serialized.ok) {
    throw new Error(serialized.error);
  }
  return serialized.value;
}

describe("resolveConfig — format equivalence", () => {
  it("spx.config.json produces the same typed Config as the default config format with equivalent content", async () => {
    let defaultResult: unknown;
    let jsonResult: unknown;

    await withTestEnv(EQUIV_CONFIG, async ({ projectDir }) => {
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) defaultResult = r.value;
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.json, serializeEquivalentConfig(CONFIG_FILE_FORMAT.JSON));
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) jsonResult = r.value;
    });

    expect(jsonResult).toEqual(defaultResult);
  });

  it("spx.config.toml produces the same typed Config as the default config format with equivalent content", async () => {
    let defaultResult: unknown;
    let tomlResult: unknown;

    await withTestEnv(EQUIV_CONFIG, async ({ projectDir }) => {
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) defaultResult = r.value;
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.toml, serializeEquivalentConfig(CONFIG_FILE_FORMAT.TOML));
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) tomlResult = r.value;
    });

    expect(tomlResult).toEqual(defaultResult);
  });

  it("all three formats produce identical typed Configs for the same key-value structure", async () => {
    const results: unknown[] = [];

    await withTestEnv(EQUIV_CONFIG, async ({ projectDir }) => {
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.json, serializeEquivalentConfig(CONFIG_FILE_FORMAT.JSON));
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, DEFAULT_CONFIG_FILENAME));
      await writeRaw(CONFIG_FILENAMES.toml, serializeEquivalentConfig(CONFIG_FILE_FORMAT.TOML));
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    expect(results).toHaveLength(Object.keys(CONFIG_FILENAMES).length);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it("rejects config mutation requests without a section path", async () => {
    await withTestEnv({}, async ({ projectDir }) => {
      const result = serializeConfigFileSectionsWithSetIn(
        configFileForFormat(projectDir),
        [],
        {},
      );

      expect(result.ok).toBe(false);
    });
  });
});
