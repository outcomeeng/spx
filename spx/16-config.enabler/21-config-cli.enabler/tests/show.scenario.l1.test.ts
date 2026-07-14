import { describe, expect, it } from "vitest";

import { showCommand } from "@/commands/config/show";
import type { CliDeps } from "@/commands/config/types";
import {
  CONFIG_FILE_FORMAT,
  configFileForFormat,
  type ConfigFileFormat,
  DEFAULT_CONFIG_FILE_FORMAT,
  parseConfigFileSections,
} from "@/config/index";
import type { Config, Result } from "@/config/types";
import { specTreeConfigDescriptor } from "@/lib/spec-tree";
import { compareAsciiStrings } from "@/lib/state-store";
import { CONFIG_TEST_GENERATOR, sampleConfigTestValue } from "@testing/generators/config/descriptors";

function makeDeps(resolved: Result<Config>): CliDeps {
  return {
    resolveConfig: async () => resolved,
    readProductConfigFile: async () => sampleConfigTestValue(CONFIG_TEST_GENERATOR.absentConfigFileReadResult()),
    resolveConfigFromReadResult: () => resolved,
    resolveProductDir: () => sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()),
    descriptors: [specTreeConfigDescriptor],
  };
}

function defaultsConfig(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeDefaultsConfig());
}

function subsetConfig(): Config {
  return sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeSubsetConfig());
}

function parseOutput(format: ConfigFileFormat, raw: string): Config {
  const parsed = parseConfigFileSections(
    configFileForFormat(sampleConfigTestValue(CONFIG_TEST_GENERATOR.productDir()), format, raw),
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
}

describe("showCommand — default-format output", () => {
  it("emits a default-format dump of the resolved Config when no overrides apply, exit 0", async () => {
    const config = defaultsConfig();
    const deps = makeDeps({ ok: true, value: config });

    const result = await showCommand({}, deps);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toHaveLength(0);
    expect(parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout)).toEqual(config);
  });

  it("reflects config-driven overrides in the emitted default format", async () => {
    const config = subsetConfig();
    const deps = makeDeps({ ok: true, value: config });

    const result = await showCommand({}, deps);

    expect(result.exitCode).toBe(0);
    const parsed = parseOutput(DEFAULT_CONFIG_FILE_FORMAT, result.stdout);
    const specTree = parsed[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
    const expected = config[specTreeConfigDescriptor.section] as typeof specTreeConfigDescriptor.defaults;
    expect(Object.keys(specTree.kinds).sort(compareAsciiStrings)).toEqual(
      Object.keys(expected.kinds).sort(compareAsciiStrings),
    );
  });
});

describe("showCommand — JSON output", () => {
  it("emits a JSON document when --json is set, exit 0", async () => {
    const config = defaultsConfig();
    const deps = makeDeps({ ok: true, value: config });

    const result = await showCommand({ json: true }, deps);

    expect(result.exitCode).toBe(0);
    expect(parseOutput(CONFIG_FILE_FORMAT.JSON, result.stdout)).toEqual(config);
  });

  it("JSON and default-format encodings of the same resolved Config round-trip to equal values", async () => {
    const deps = makeDeps({ ok: true, value: subsetConfig() });

    const defaultResult = await showCommand({}, deps);
    const jsonResult = await showCommand({ json: true }, deps);

    expect(parseOutput(DEFAULT_CONFIG_FILE_FORMAT, defaultResult.stdout)).toEqual(
      parseOutput(CONFIG_FILE_FORMAT.JSON, jsonResult.stdout),
    );
  });
});

describe("showCommand — resolution failure", () => {
  it("surfaces a resolveConfig error with non-zero exit and a descriptor-qualified stderr message", async () => {
    const deps = makeDeps({
      ok: false,
      error: sampleConfigTestValue(CONFIG_TEST_GENERATOR.specTreeUnknownKindError()),
    });

    const result = await showCommand({}, deps);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toHaveLength(0);
    expect(result.stderr).toContain(specTreeConfigDescriptor.section);
  });
});
