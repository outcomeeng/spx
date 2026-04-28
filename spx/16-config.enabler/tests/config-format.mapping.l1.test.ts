import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIG_FILENAMES, resolveConfig } from "@/config/index";
import { KIND_REGISTRY, specTreeConfigDescriptor } from "@/spec/config";
import { configToToml, withTestEnv } from "@/spec/testing/index";
import type { Config } from "@/spec/testing/index";

const EQUIV_CONFIG: Config = {
  specTree: { kinds: { pdr: KIND_REGISTRY.pdr } },
};

const EQUIV_JSON = JSON.stringify(EQUIV_CONFIG);

const EQUIV_TOML = configToToml(EQUIV_CONFIG);

describe("resolveConfig — format equivalence", () => {
  it("spx.config.json produces the same typed Config as spx.config.yaml with equivalent content", async () => {
    let yamlResult: unknown;
    let jsonResult: unknown;

    await withTestEnv(EQUIV_CONFIG, async ({ projectDir }) => {
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) yamlResult = r.value;
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, CONFIG_FILENAMES.yaml));
      await writeRaw(CONFIG_FILENAMES.json, EQUIV_JSON);
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) jsonResult = r.value;
    });

    expect(jsonResult).toEqual(yamlResult);
  });

  it("spx.config.toml produces the same typed Config as spx.config.yaml with equivalent content", async () => {
    let yamlResult: unknown;
    let tomlResult: unknown;

    await withTestEnv(EQUIV_CONFIG, async ({ projectDir }) => {
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) yamlResult = r.value;
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, CONFIG_FILENAMES.yaml));
      await writeRaw(CONFIG_FILENAMES.toml, EQUIV_TOML);
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) tomlResult = r.value;
    });

    expect(tomlResult).toEqual(yamlResult);
  });

  it("all three formats produce identical typed Configs for the same key-value structure", async () => {
    const results: unknown[] = [];

    await withTestEnv(EQUIV_CONFIG, async ({ projectDir }) => {
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, CONFIG_FILENAMES.yaml));
      await writeRaw(CONFIG_FILENAMES.json, EQUIV_JSON);
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    await withTestEnv({}, async ({ projectDir, writeRaw }) => {
      await rm(join(projectDir, CONFIG_FILENAMES.yaml));
      await writeRaw(CONFIG_FILENAMES.toml, EQUIV_TOML);
      const r = await resolveConfig(projectDir, [specTreeConfigDescriptor]);
      expect(r.ok).toBe(true);
      if (r.ok) results.push(r.value);
    });

    expect(results).toHaveLength(Object.keys(CONFIG_FILENAMES).length);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });
});
